"use client";

import { useParams } from "next/navigation";

export function JobId() {
  const { id } = useParams<{ id: string }>();
  return <p className="font-mono text-xs text-muted">job: {id}</p>;
}
