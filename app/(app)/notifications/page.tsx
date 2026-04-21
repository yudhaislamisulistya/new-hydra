"use client";

import { useEffect, useState } from "react";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { useUserStore } from "../../../store/useUserStore";
import { createClient } from "../../../utils/supabase/client";
import { Bell, CheckCircle2 } from "lucide-react";

type ChildNotification = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
};

export default function NotificationsPage() {
  const { profile } = useUserStore();
  const [notifications, setNotifications] = useState<ChildNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNotifications() {
      if (!profile?.id || profile.role !== "student") return;

      const supabase = createClient();

      try {
        const { data, error } = await supabase
          .from("child_notifications")
          .select("id, title, message, created_at, is_read")
          .eq("child_id", profile.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const rows = (data as ChildNotification[] | null) || [];
        setNotifications(rows);

        const unreadIds = rows.filter((notification) => !notification.is_read).map((notification) => notification.id);
        if (unreadIds.length > 0) {
          const { error: updateError } = await supabase
            .from("child_notifications")
            .update({ is_read: true })
            .eq("child_id", profile.id)
            .in("id", unreadIds);

          if (updateError) {
            console.error("Error marking notifications as read:", updateError);
          } else {
            setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));
            window.dispatchEvent(new Event("notifications-updated"));
          }
        }
      } catch (error) {
        console.error("Error fetching notifications:", error);
      } finally {
        setLoading(false);
      }
    }

    void fetchNotifications();
  }, [profile?.id, profile?.role]);

  if (profile?.role !== "student") {
    return (
      <>
        <Header title="Notifikasi" />
        <div className="p-6 text-center text-slate-500">Halaman ini khusus untuk siswa.</div>
      </>
    );
  }

  return (
    <>
      <Header title="Notifikasi" />
      <div className="p-6 space-y-4 pb-24">
        <div>
          <h2 className="font-extrabold text-slate-800 text-2xl">Pengingat Untukmu</h2>
          <p className="text-slate-500 text-sm mt-1">Lihat pesan pengingat dari orang tua agar kamu tetap terhidrasi.</p>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : notifications.length === 0 ? (
          <Card className="border-dashed border-2 border-slate-200 bg-transparent">
            <CardContent className="p-10 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
                <Bell size={32} />
              </div>
              <p className="text-slate-500 font-medium">Belum ada pengingat masuk.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Card key={notification.id} className="border border-slate-200 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-800">{notification.title}</p>
                      <p className="text-sm text-slate-600 mt-1 leading-relaxed">{notification.message}</p>
                      <p className="text-[11px] text-slate-400 mt-2">
                        {new Date(notification.created_at).toLocaleString("id-ID", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 border border-green-200 shrink-0">
                      <CheckCircle2 size={12} />
                      Dibaca
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
