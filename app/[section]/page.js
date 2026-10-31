import Workspace from "../../components/Workspace";
import { notFound } from "next/navigation";
const pages = [
  "dashboard",
  "projects",
  "requirements",
  "requirement-editor",
  "generation",
  "test-cases",
  "validation",
  "traceability",
  "evaluation",
  "history",
  "documentation",
];
export function generateStaticParams() {
  return pages.map((section) => ({ section }));
}
export default async function Page({ params }) {
  const { section } = await params;
  if (!pages.includes(section)) notFound();
  return <Workspace section={section} />;
}
