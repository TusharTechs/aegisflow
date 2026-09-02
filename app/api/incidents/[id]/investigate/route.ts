import { runInvestigation } from "@/lib/orchestration/investigation";

export const dynamic = "force-dynamic";
// The investigation runs five concurrent SerpApi queries, six extractions and a
// paced flush to Xano. The platform default (10s) cuts that off mid-run.
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const step of runInvestigation(id)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(step)}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: true })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}