"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import AvatarUploader from "@/components/AvatarUploader";
import ImageGrid from "@/components/ImageGrid";
import ShareButton from "./ShareButton";

interface PersonData {
  englishName: string | null;
  chineseName: string | null;
  grade: string | null;
  bio: string | null;
  avatarUrl: string | null;
}

interface DisplayImage {
  id: string;
  url: string;
  sort: number;
}

interface MeEditFormProps {
  person: {
    id: string;
    code: string;
    englishName: string | null;
    chineseName: string | null;
    grade: string | null;
    bio: string | null;
    avatarUrl: string | null;
    images: DisplayImage[];
  };
}

function isProfileBlank(person: MeEditFormProps["person"]): boolean {
  return !(
    person.chineseName ||
    person.englishName ||
    person.grade ||
    person.bio ||
    person.avatarUrl ||
    (person.images && person.images.length > 0)
  );
}

export default function MeEditForm({ person: initialPerson }: MeEditFormProps) {
  const [form, setForm] = useState<PersonData>({
    englishName: initialPerson.englishName ?? "",
    chineseName: initialPerson.chineseName ?? "",
    grade: initialPerson.grade ?? "",
    bio: initialPerson.bio ?? "",
    avatarUrl: initialPerson.avatarUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState<DisplayImage[]>(initialPerson.images);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [hasBeenEdited, setHasBeenEdited] = useState(
    () => !isProfileBlank(initialPerson)
  );
  const [isEditing, setIsEditing] = useState(() =>
    isProfileBlank(initialPerson)
  );
  const personCode = initialPerson.code;

  const bioCodePoints = [...(form.bio || "")].length;
  const bioOverLimit = bioCodePoints > 80;
  const saveDisabled = saving || bioOverLimit;

  const updateField = useCallback(
    <K extends keyof PersonData>(field: K, value: PersonData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (!dirty) setDirty(true);
    },
    [dirty],
  );

  // ── Save handler ──

  const handleSave = useCallback(async () => {
    if (bioOverLimit) {
      setSaveMessage({
        type: "error",
        text: `Bio exceeds 80 characters (${bioCodePoints}/80)`,
      });
      return;
    }
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          englishName: form.englishName || null,
          chineseName: form.chineseName || null,
          grade: form.grade || null,
          bio: form.bio || null,
          avatarUrl: form.avatarUrl || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }

      setSaveMessage({ type: "success", text: "Saved!" });
      setDirty(false);
      setHasBeenEdited(true);
      setIsEditing(false);
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setSaveMessage({ type: "error", text: message });
    } finally {
      setSaving(false);
    }
  }, [form, bioOverLimit, bioCodePoints]);

  // ── Form ──

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100 py-8 px-4">
      <div className="mx-auto max-w-md">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">
              {isEditing ? "Edit Profile" : "My Profile"}
            </h1>
            <p className="mt-1.5 text-sm text-stone-500">
              {isEditing
                ? "Set up your OWeek personal homepage"
                : "Your OWeek showcase"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {personCode && (
              <Link
                href={`/loc/${personCode}`}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-500 transition-colors hover:bg-amber-50 hover:text-amber-600"
                aria-label="View position"
                title="查看展位"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <title>View position</title>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
              </Link>
            )}
            
            {hasBeenEdited && (
              <button
                type="button"
                onClick={() => setIsEditing((v) => !v)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-700"
                aria-label={isEditing ? "Lock editing" : "Edit profile"}
              >
                {isEditing ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <title>Lock</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <title>Edit</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                  </svg>
                )}
              </button>
            )}
            <ShareButton code={personCode} />
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm">
          <AvatarUploader
            currentUrl={form.avatarUrl}
            onAvatarChange={(url) => updateField("avatarUrl", url)}
            disabled={!isEditing}
          />
        </div>

        <div className="space-y-5 rounded-2xl bg-white p-6 shadow-sm">
          {isEditing ? (
            <>
              {/* English Name */}
              <div>
                <label
                  htmlFor="englishName"
                  className="mb-1.5 block text-sm font-medium text-stone-700"
                >
                  English Name
                </label>
                <input
                  id="englishName"
                  type="text"
                  value={form.englishName ?? ""}
                  onChange={(e) => updateField("englishName", e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 transition-all focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Chinese Name */}
              <div>
                <label
                  htmlFor="chineseName"
                  className="mb-1.5 block text-sm font-medium text-stone-700"
                >
                  Chinese Name
                </label>
                <input
                  id="chineseName"
                  type="text"
                  value={form.chineseName ?? ""}
                  onChange={(e) => updateField("chineseName", e.target.value)}
                  placeholder="e.g. 张三"
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 transition-all focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Grade */}
              <div>
                <label
                  htmlFor="grade"
                  className="mb-1.5 block text-sm font-medium text-stone-700"
                >
                  Grade
                </label>
                <input
                  id="grade"
                  type="text"
                  value={form.grade ?? ""}
                  onChange={(e) => updateField("grade", e.target.value)}
                  placeholder="e.g. 2026"
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 transition-all focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Bio */}
              <div>
                <label
                  htmlFor="bio"
                  className="mb-1.5 block text-sm font-medium text-stone-700"
                >
                  Bio
                </label>
                <textarea
                  id="bio"
                  value={form.bio ?? ""}
                  onChange={(e) => updateField("bio", e.target.value)}
                  rows={3}
                  placeholder="Tell us a bit about yourself…"
                  className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 transition-all focus:outline-none focus:ring-2 ${
                    bioOverLimit
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : "border-stone-200 focus:border-teal-500 focus:ring-teal-500/20"
                  }`}
                />
                <div className="mt-1.5 flex items-center justify-between">
                  {bioOverLimit && (
                    <p className="text-xs text-red-500">
                      {bioCodePoints - 80} character{bioCodePoints - 80 > 1 ? "s" : ""} over limit
                    </p>
                  )}
                  <span
                    className={`ml-auto text-xs ${
                      bioOverLimit
                        ? "font-semibold text-red-500"
                        : "text-stone-400"
                    }`}
                  >
                    {bioCodePoints}/80
                  </span>
                </div>
              </div>

              <ImageGrid
                images={images}
                onImagesChange={setImages}
                disabled={false}
              />

            </>
          ) : (
            <>
              {(form.chineseName || form.englishName) && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400">Name</p>
                  <p className="text-sm text-stone-900">
                    {[form.englishName, form.chineseName].filter(Boolean).join(" / ")}
                  </p>
                </div>
              )}
              {form.grade && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400">Grade</p>
                  <p className="text-sm text-stone-900">{form.grade}</p>
                </div>
              )}
              {form.bio && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400">Bio</p>
                  <p className="text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">{form.bio}</p>
                </div>
              )}
              <ImageGrid
                images={images}
                onImagesChange={setImages}
                disabled={true}
              />
            </>
          )}
        </div>

        {isEditing && (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveDisabled}
              className="mt-6 w-full rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-700 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            {hasBeenEdited && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="mt-2 w-full rounded-xl bg-stone-100 px-6 py-3 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200"
              >
                Cancel
              </button>
            )}
          </>
        )}

        {saveMessage && (
          <div className="mt-4 text-center">
            <p
              className={`text-sm ${
                saveMessage.type === "success"
                  ? "text-emerald-600"
                  : "text-red-500"
              }`}
            >
              {saveMessage.type === "success" ? "✓ " : "✕ "}
              {saveMessage.text}
            </p>
          </div>
        )}

        {!dirty && !saveMessage && isEditing && (
          <p className="mt-6 text-center text-xs text-stone-400">
            Changes are auto-saved when you press Save
          </p>
        )}
      </div>
    </div>
  );
}