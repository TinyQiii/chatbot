using System.Text;
using UglyToad.PdfPig;

namespace backend.Rag;

public static class PdfTextExtractor
{
    public static string ExtractAllText(Stream pdfStream)
    {
        using var document = PdfDocument.Open(pdfStream);
        var sb = new StringBuilder();
        foreach (var page in document.GetPages())
        {
            var text = page.Text;
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            sb.AppendLine(text.Trim());
            sb.AppendLine();
        }
        return sb.ToString().Trim();
    }
}

