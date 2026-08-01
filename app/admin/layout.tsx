import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理员后台",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
