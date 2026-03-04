import { Card, CardContent } from "~/components/ui/card";

export function SetupActionErrorCard({ error }: { error?: string }) {
  if (!error) return null;

  return (
    <Card className="border-rose-300 bg-rose-50">
      <CardContent className="pt-5 text-sm font-semibold text-rose-700">{error}</CardContent>
    </Card>
  );
}

