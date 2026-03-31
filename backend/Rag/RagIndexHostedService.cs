namespace backend.Rag;

public sealed class RagIndexHostedService : IHostedService
{
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly RagIndex _index;

    public RagIndexHostedService(
        IWebHostEnvironment env,
        IConfiguration config,
        IHttpClientFactory httpClientFactory,
        RagIndex index)
    {
        _env = env;
        _config = config;
        _httpClientFactory = httpClientFactory;
        _index = index;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var apiKey = _config["Google:ApiKey"] ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _index.MarkNotReady("Missing Gemini API key at startup; skipping RAG indexing.");
            return;
        }

        var dataDir = Path.Combine(_env.ContentRootPath, "Data");
        var http = _httpClientFactory.CreateClient();

        await _index.InitializeAsync(dataDir, apiKey, http, cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

