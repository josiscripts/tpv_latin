import { createFileRoute } from "@tanstack/react-router";
import { ExtractionDetailScreen } from "@/components/extraction-detail-screen";

export const Route = createFileRoute("/documents/extraction/$id")({
  component: ExtractionDetailScreen,
  head: () => ({
    meta: [
      { title: "Revisión de Extracción — TPV PRO" },
      { name: "description", content: "Detalle de la extracción de IA del documento" },
    ],
  }),
});
