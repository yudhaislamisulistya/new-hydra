"use client";

import { useEffect, useState } from "react";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { useUserStore } from "../../../store/useUserStore";
import { createClient } from "../../../utils/api/client";
import { XP_PER_SURVEY, XP_PER_HYDRATION_LOG } from "../../../utils/gamification";
import { Trophy, Zap, Droplet, ClipboardList, Medal, Crown, ArrowLeft, Home } from "lucide-react";
import Link from "next/link";

// XP Rules:
// - Each survey/quiz completed = 100 XP
// - Each hydration log entry = 10 XP
// - Each daily check-in gives progressive XP based on streak

interface LeaderboardEntry {
  id: string;
  name: string;
  surveyCount: number;
  hydrationCount: number;
  checkinCount: number;
  checkinXp: number;
  totalXP: number;
  rank: number;
}

type LocalLeaderboardRow = {
  id: string;
  name: string;
  survey_count: number;
  hydration_count: number;
  checkin_count: number;
  checkin_xp: number;
  total_xp: number;
  rank: number;
};

export default function LeaderboardPage() {
  const { profile } = useUserStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    async function fetchLeaderboard() {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_leaderboard');

      if (error) {
        console.error('Error fetching leaderboard:', error);
        setLeaderboard([]);
        setMyRank(null);
        setLoading(false);
        return;
      }

      const entries: LeaderboardEntry[] = (
        (data as LocalLeaderboardRow[] | null) || []
      ).map((row) => ({
        id: row.id,
        name: row.name,
        surveyCount: Number(row.survey_count),
        hydrationCount: Number(row.hydration_count),
        checkinCount: Number(row.checkin_count),
        checkinXp: Number(row.checkin_xp),
        totalXP: Number(row.total_xp),
        rank: Number(row.rank),
      }));

      setLeaderboard(entries);
      setMyRank(profile?.id ? entries.find((entry) => entry.id === profile.id) || null : null);
      setLoading(false);
    }

    void fetchLeaderboard();
  }, [profile?.id]);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown size={22} className="text-yellow-500" />;
    if (rank === 2) return <Medal size={22} className="text-slate-400" />;
    if (rank === 3) return <Medal size={22} className="text-amber-600" />;
    return <span className="text-sm font-black text-slate-400 w-[22px] text-center">{rank}</span>;
  };

  const getRankBg = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200';
    if (rank === 2) return 'bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200';
    if (rank === 3) return 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200';
    return 'bg-white border-slate-100';
  };

  return (
    <>
      <Header title="Papan Peringkat" />
      <div className="p-6 space-y-6 pb-28">

        {/* Hero Card */}
        <Card className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-white border-none overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-10 translate-x-10"></div>
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-8 -translate-x-6"></div>
          <CardContent className="p-6 relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                <Trophy size={24} className="text-yellow-300" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold">Papan Peringkat</h2>
                <p className="text-white/70 text-xs">Kumpulkan XP dan jadilah yang terbaik!</p>
              </div>
            </div>

            {myRank && (
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider">Peringkat Kamu</p>
                  <p className="text-3xl font-black mt-1">#{myRank.rank}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider">Total XP</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Zap size={20} className="text-yellow-300" />
                    <p className="text-3xl font-black">{myRank.totalXP}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* XP Info */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="bg-blue-50 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
              <ClipboardList size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-blue-400 uppercase">Kuis / Survei</p>
              <p className="text-sm font-black text-blue-700">+{XP_PER_SURVEY} XP</p>
            </div>
          </div>
          <div className="bg-cyan-50 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-cyan-100 rounded-xl flex items-center justify-center">
              <Droplet size={16} className="text-cyan-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-cyan-400 uppercase">Catat Minum</p>
              <p className="text-sm font-black text-cyan-700">+{XP_PER_HYDRATION_LOG} XP</p>
            </div>
          </div>
          <div className="bg-amber-50 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center">
              <Zap size={16} className="text-amber-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-amber-400 uppercase">Daily Check-In</p>
              <p className="text-sm font-black text-amber-700">+20 s/d +50 XP</p>
            </div>
          </div>
        </div>

        {/* Leaderboard List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-slate-400 font-medium text-sm">Memuat peringkat...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leaderboard.slice(0, visibleCount).map((entry) => {
              const isMe = entry.id === profile?.id;
              return (
                <div
                  key={entry.id}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${getRankBg(entry.rank)} ${
                    isMe ? 'ring-2 ring-indigo-400 ring-offset-2' : ''
                  }`}
                >
                  {/* Rank */}
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
                    {getRankIcon(entry.rank)}
                  </div>

                  {/* Avatar + Name */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                      entry.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                      entry.rank === 2 ? 'bg-slate-100 text-slate-700' :
                      entry.rank === 3 ? 'bg-amber-100 text-amber-700' :
                      'bg-indigo-50 text-indigo-600'
                    }`}>
                      {entry.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">
                        {entry.name} {isMe && <span className="text-indigo-500">(Kamu)</span>}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          <ClipboardList size={10} /> {entry.surveyCount} kuis
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          <Droplet size={10} /> {entry.hydrationCount} minum
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          <Zap size={10} /> {entry.checkinCount} check-in
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* XP */}
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1">
                      <Zap size={14} className="text-yellow-500" />
                      <span className="font-black text-slate-800">{entry.totalXP}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold">XP</p>
                  </div>
                </div>
              );
            })}

            {visibleCount < leaderboard.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + 10)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-indigo-600 transition-colors hover:bg-slate-50"
              >
                Lihat Lainnya ({leaderboard.length - visibleCount} lagi)
              </button>
            )}
          </div>
        )}

        {/* Navigasi */}
        <div className="flex gap-3 pt-2">
          <Link
            href="/survey"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft size={18} />
            Kembali
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
          >
            <Home size={18} />
            Selesai
          </Link>
        </div>

      </div>
    </>
  );
}
