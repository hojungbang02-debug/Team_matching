import { StudentWorkspace } from "@/components/student-workspace";

export default async function StudentPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room } = await searchParams;
  return <StudentWorkspace initialRoomCode={room ?? ""} />;
}
