using System.Text;
using System.Text.Json;

namespace backend.Rag;

public sealed class RagIndex
{
    private readonly List<RagChunk> _chunks = new();
    private readonly object _gate = new();

    public bool IsReady { get; private set; }
    public string? LastError { get; private set; }

    public void MarkNotReady(string error)
    {
        IsReady = false;
        LastError = error;
    }

    public int ChunkCount
    {
        get
        {
            lock (_gate)
            {
                return _chunks.Count;
            }
        }
    }

    public IReadOnlyList<string> SourceIds
    {
        get
        {
            lock (_gate)
            {
                return _chunks.Select(c => c.SourceId).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(s => s).ToArray();
            }
        }
    }

    public async Task InitializeAsync(
        string dataDirectory,
        string apiKey,
        HttpClient http,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Directory.Exists(dataDirectory))
            {
                LastError = $"RAG data directory not found: {dataDirectory}";
                IsReady = false;
                return;
            }

            var files = Directory
                .EnumerateFiles(dataDirectory, "*.*", SearchOption.AllDirectories)
                .Where(path =>
                    path.EndsWith(".md", StringComparison.OrdinalIgnoreCase)
                    || path.EndsWith(".txt", StringComparison.OrdinalIgnoreCase))
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            if (files.Length == 0)
            {
                LastError = $"No .md/.txt files found in {dataDirectory}";
                IsReady = false;
                return;
            }

            var planned = new List<(string sourceId, int chunkIndex, string text)>();
            foreach (var file in files)
            {
                var sourceId = Path.GetFileName(file);
                var raw = await File.ReadAllTextAsync(file, cancellationToken);
                var normalized = NormalizeText(raw);

                var idx = 0;
                foreach (var chunk in ChunkText(normalized, maxChars: 1200, overlapChars: 180))
                {
                    if (string.IsNullOrWhiteSpace(chunk))
                    {
                        continue;
                    }

                    planned.Add((sourceId, idx, chunk));
                    idx++;
                }
            }

            if (planned.Count == 0)
            {
                LastError = "No chunks produced from knowledge base files.";
                IsReady = false;
                return;
            }

            var embeddings = await BatchEmbedDocumentsAsync(planned, apiKey, http, cancellationToken);
            if (embeddings.Count != planned.Count)
            {
                LastError = $"Embedding count mismatch. Planned={planned.Count}, Got={embeddings.Count}";
                IsReady = false;
                return;
            }

            lock (_gate)
            {
                _chunks.Clear();
                for (var i = 0; i < planned.Count; i++)
                {
                    var item = planned[i];
                    _chunks.Add(new RagChunk(item.sourceId, item.chunkIndex, item.text, embeddings[i]));
                }
            }

            IsReady = true;
            LastError = null;
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            IsReady = false;
        }
    }

    public async Task<IReadOnlyList<(RagChunk Chunk, double Score)>> SearchAsync(
        string query,
        int topK,
        string apiKey,
        HttpClient http,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return Array.Empty<(RagChunk, double)>();
        }

        RagChunk[] snapshot;
        lock (_gate)
        {
            snapshot = _chunks.ToArray();
        }

        if (snapshot.Length == 0)
        {
            return Array.Empty<(RagChunk, double)>();
        }

        var queryEmbedding = await EmbedQueryAsync(query.Trim(), apiKey, http, cancellationToken);

        var scored = new List<(RagChunk Chunk, double Score)>(snapshot.Length);
        foreach (var chunk in snapshot)
        {
            var score = CosineSimilarity(queryEmbedding, chunk.Embedding);
            scored.Add((chunk, score));
        }

        return scored
            .OrderByDescending(x => x.Score)
            .Take(Math.Max(1, topK))
            .ToArray();
    }

    public static string BuildContextBlock(IReadOnlyList<(RagChunk Chunk, double Score)> results)
    {
        if (results.Count == 0)
        {
            return string.Empty;
        }

        var sb = new StringBuilder();
        foreach (var (chunk, _) in results)
        {
            sb.AppendLine($"[SOURCE:{chunk.SourceId}#{chunk.ChunkIndex}]");
            sb.AppendLine(chunk.Text.Trim());
            sb.AppendLine();
        }
        return sb.ToString().TrimEnd();
    }

    private static async Task<List<float[]>> BatchEmbedDocumentsAsync(
        List<(string sourceId, int chunkIndex, string text)> planned,
        string apiKey,
        HttpClient http,
        CancellationToken cancellationToken)
    {
        // Keep request sizes reasonable.
        const int batchSize = 32;
        var all = new List<float[]>(planned.Count);
        for (var i = 0; i < planned.Count; i += batchSize)
        {
            var batch = planned.Skip(i).Take(batchSize).ToArray();

            var body = new
            {
                requests = batch.Select(item => new
                {
                    model = "models/gemini-embedding-001",
                    taskType = "RETRIEVAL_DOCUMENT",
                    title = item.sourceId,
                    content = new
                    {
                        parts = new[]
                        {
                            new { text = item.text }
                        }
                    }
                })
            };

            var json = JsonSerializer.Serialize(body);
            var endpoint =
                $"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key={apiKey}";

            using var resp = await http.PostAsync(
                endpoint,
                new StringContent(json, Encoding.UTF8, "application/json"),
                cancellationToken);

            var text = await resp.Content.ReadAsStringAsync(cancellationToken);
            if (!resp.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"BatchEmbedContents failed: {text}");
            }

            using var doc = JsonDocument.Parse(text);
            if (!doc.RootElement.TryGetProperty("embeddings", out var embeddingsEl)
                || embeddingsEl.ValueKind != JsonValueKind.Array)
            {
                throw new InvalidOperationException("BatchEmbedContents response missing embeddings[].");
            }

            foreach (var emb in embeddingsEl.EnumerateArray())
            {
                all.Add(ReadEmbeddingValues(emb));
            }
        }

        return all;
    }

    private static async Task<float[]> EmbedQueryAsync(
        string query,
        string apiKey,
        HttpClient http,
        CancellationToken cancellationToken)
    {
        var body = new
        {
            model = "models/gemini-embedding-001",
            taskType = "RETRIEVAL_QUERY",
            content = new
            {
                parts = new[]
                {
                    new { text = query }
                }
            }
        };

        var json = JsonSerializer.Serialize(body);
        var endpoint =
            $"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={apiKey}";

        using var resp = await http.PostAsync(
            endpoint,
            new StringContent(json, Encoding.UTF8, "application/json"),
            cancellationToken);

        var text = await resp.Content.ReadAsStringAsync(cancellationToken);
        if (!resp.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"EmbedContent failed: {text}");
        }

        using var doc = JsonDocument.Parse(text);
        if (!doc.RootElement.TryGetProperty("embedding", out var embEl))
        {
            throw new InvalidOperationException("EmbedContent response missing embedding.");
        }

        return ReadEmbeddingValues(embEl);
    }

    private static float[] ReadEmbeddingValues(JsonElement contentEmbedding)
    {
        if (!contentEmbedding.TryGetProperty("values", out var valuesEl)
            || valuesEl.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidOperationException("Embedding missing values[].");
        }

        var values = new float[valuesEl.GetArrayLength()];
        var i = 0;
        foreach (var v in valuesEl.EnumerateArray())
        {
            values[i++] = (float)v.GetDouble();
        }
        return values;
    }

    private static double CosineSimilarity(float[] a, float[] b)
    {
        var len = Math.Min(a.Length, b.Length);
        if (len == 0)
        {
            return 0;
        }

        double dot = 0;
        double na = 0;
        double nb = 0;

        for (var i = 0; i < len; i++)
        {
            var av = a[i];
            var bv = b[i];
            dot += av * bv;
            na += av * av;
            nb += bv * bv;
        }

        var denom = Math.Sqrt(na) * Math.Sqrt(nb);
        return denom <= 0 ? 0 : dot / denom;
    }

    private static string NormalizeText(string text)
    {
        return text.Replace("\r\n", "\n").Replace("\r", "\n").Trim();
    }

    private static IEnumerable<string> ChunkText(string text, int maxChars, int overlapChars)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            yield break;
        }

        var t = text.Trim();
        var start = 0;
        while (start < t.Length)
        {
            var end = Math.Min(t.Length, start + maxChars);
            var slice = t[start..end];

            // Try not to cut in the middle of a paragraph if we can.
            if (end < t.Length)
            {
                var lastBreak = slice.LastIndexOf("\n\n", StringComparison.Ordinal);
                if (lastBreak >= Math.Max(80, slice.Length / 3))
                {
                    slice = slice[..lastBreak].TrimEnd();
                    end = start + lastBreak;
                }
            }

            if (!string.IsNullOrWhiteSpace(slice))
            {
                yield return slice.Trim();
            }

            if (end >= t.Length)
            {
                yield break;
            }

            start = Math.Max(0, end - overlapChars);
        }
    }
}

