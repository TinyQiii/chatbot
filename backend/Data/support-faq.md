# Support FAQ (sample knowledge base)

## What is RAG?

Retrieval-Augmented Generation means: before the model answers, the app searches a small document index, injects the top matching snippets into the prompt, and asks the model to ground answers in that CONTEXT and cite sources using labels like `[support-faq.md#0]`.

## How do I turn RAG on?

In the web UI, enable **Use knowledge base (RAG)** before sending a message. Questions that match these notes should get answers with citations; unrelated questions should get a normal reply, and the model should say if the knowledge base does not contain the answer.

## Streaming

The app uses Server-Sent Events style streaming from Gemini so the assistant reply appears token-by-token in the browser.

## Model selection

You can pick among allowlisted Gemini chat models in the header dropdown. The embedding model for RAG is fixed in the backend (`gemini-embedding-001`).

## RAG demo trigger keywords (for testing)

This section is intentionally written with stable trigger keywords so you can see RAG citations in the UI.

Trigger keywords:

- `RAG-DEMO-ENABLE`: how to enable RAG in the UI
- `RAG-DEMO-CITATIONS`: what citation format to expect
- `RAG-DEMO-INDEX`: when the RAG index is built (startup vs per request)

If you ask a question that includes one of the trigger keywords above, and you enable **Use knowledge base (RAG)**, the assistant should answer using the knowledge base and include citations like:

- `[SOURCE:support-faq.md#0]` (example label format)

## How to enable RAG (keyword: RAG-DEMO-ENABLE)

In the web UI, check the box labeled **Use knowledge base (RAG)** before sending your message.

## Citation format (keyword: RAG-DEMO-CITATIONS)

When RAG is used, the backend injects a CONTEXT block and instructs the model to cite sources using exact labels like:

- `[SOURCE:<filename>#<chunkIndex>]`

## Index build timing (keyword: RAG-DEMO-INDEX)

This demo builds the RAG embeddings index at backend startup by reading Markdown files from `backend/Data/`.


