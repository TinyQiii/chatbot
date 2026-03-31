namespace backend.Rag;

public sealed record RagChunk(
    string SourceId,
    int ChunkIndex,
    string Text,
    float[] Embedding
);

