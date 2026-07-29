"use client";

import Link from "next/link";

export function AppHeader({
  role,
  title,
  subtitle,
}: {
  role: "교사" | "학생";
  title: string;
  subtitle: string;
}) {
  return (
    <header className="app-header">
      <Link href="/" className="brand">
        <span className="brand-mark">M</span>
        <span>모이다</span>
      </Link>
      <div className="header-context">
        <span className="role-pill">{role}</span>
        <div>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>
      </div>
    </header>
  );
}
