import { Suspense } from "react";
import { PageLoading } from "@/components/student/AsyncState";
import BrowseClient from "./BrowseClient";

export const metadata = { title: "Browse" };
export default function BrowsePage() { return <Suspense fallback={<PageLoading label="正在打开画廊" />}><BrowseClient /></Suspense>; }
