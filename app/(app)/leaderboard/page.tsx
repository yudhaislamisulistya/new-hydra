"use client";

import { useEffect, useState } from "react";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { useUserStore } from "../../../store/useUserStore";
import { createClient } from "../../../utils/supabase/client";
import { Trophy, Zap, Droplet, ClipboardList, Medal, Crown, Star } from "lucide-react";

// XP Rules:
// - Each survey/quiz completed = 100 XP
// - Each hydration log entry = 10 XP

interface LeaderboardEntry {
  id: string;
  name: string;
  surveyCount: number;
  hydrationCount: number;
  totalXP: number;
  rank: number;
}

export default function LeaderboardPage() {
  const { profile } = useUserStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);

  useEffect(() => {
    async function fetchLeaderboard() {
      const supabase = createClient();

      // 1. Get all students
      const { data: students } = await supabase
        .from('student_profiles')
        .select('id, profiles!student_profiles_id_fkey(full_name)');

      if (!students || students.length === 0) {
        setLoading(false);
        return;
      }

      // 2. Get all survey responses
      const { data: surveyResponses } = await supabase
        .from('survey_responses')
        .select('respondent_id');

      // 3. Get all hydration logs
      const { data: hydrationLogs } = await supabase
        .from('hydration_logs')
        .select('student_id');

      // 4. Count per student
      const surveyCounts: Record<string, number> = {};
      (surveyResponses || []).forEach((r: any) => {
        surveyCounts[r.respondent_id] = (surveyCounts[r.respondent_id] || 0) + 1;
      });

      const hydrationCounts: Record<string, number> = {};
      (hydrationLogs || []).forEach((l: any) => {
        hydrationCounts[l.student_id] = (hydrationCounts[l.student_id] || 0) + 1;
      });

      // 5. Build leaderboard
      const entries: LeaderboardEntry[] = students.map((s: any) => {
        const surveyCount = surveyCounts[s.id] || 0;
        const hydrationCount = hydrationCounts[s.id] || 0;
        return {
          id: s.id,
          name: s.profiles?.full_name || 'Siswa',
          surveyCount,
          hydrationCount,
          totalXP: (surveyCount * 100) + (hydrationCount * 10),
          rank: 0,
        };
      });

      // 6. Sort by XP descending
      entries.sort((a, b) => b.totalXP - a.totalXP);
      entries.forEach((e, i) => { e.rank = i + 1; });

      setLeaderboard(entries);

      // Find my rank
      if (profile?.id) {
        const me = entries.find(e => e.id === profile.id);
        if (me) setMyRank(me);
      }

      setLoading(false);
    }

    fetchLeaderboard();
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
      <Header title="Leaderboard" />
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
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
              <ClipboardList size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-blue-400 uppercase">Kuis / Survei</p>
              <p className="text-sm font-black text-blue-700">+100 XP</p>
            </div>
          </div>
          <div className="bg-cyan-50 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-cyan-100 rounded-xl flex items-center justify-center">
              <Droplet size={16} className="text-cyan-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-cyan-400 uppercase">Catat Minum</p>
              <p className="text-sm font-black text-cyan-700">+10 XP</p>
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
            {leaderboard.map((entry) => {
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
          </div>
        )}

      </div>
    </>
  );
}
