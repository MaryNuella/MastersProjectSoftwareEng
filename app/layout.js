import "./globals.css";
export const metadata = {
  title: "Rule-Based Test Research Framework",
  description:
    "Deterministic test case generation and independent validation — MIVA Open University MIT research",
};
export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
