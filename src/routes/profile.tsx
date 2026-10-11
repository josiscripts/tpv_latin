import { createFileRoute } from "@tanstack/react-router";
import { ProfileScreen } from "@/components/profile-screen";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Perfil — TPV PRO" },
      { name: "description", content: "Tu perfil de usuario y datos personales." },
      { property: "og:title", content: "Perfil — TPV PRO" },
      { property: "og:description", content: "Tu perfil de usuario y datos personales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfileScreen,
});
