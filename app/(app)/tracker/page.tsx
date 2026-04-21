"use client";

import { useState } from "react";
import { Header } from "../../../components/layout/Header";
import { Card, CardContent } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { useUserStore } from "../../../store/useUserStore";
import { useHydrationStore } from "../../../store/useHydrationStore";
import { Plus, CheckCircle2 } from "lucide-react";

const DRINK_VOLUMES = [125, 200, 250, 300, 330, 500, 1000];

const DRINK_TYPES = [
  { value: "Air minum utama", label: "Air minum utama" },
  { value: "Air putih/air matang", label: "Air putih / Air matang" },
  { value: "Air mineral", label: "Air mineral" },
  { value: "Susu cair murni", label: "Susu cair murni" },
  { value: "Susu cair manis", label: "Susu cair manis" },
  { value: "Susu dan produk susu cair", label: "Susu dan produk susu cair" },
  { value: "Jus buah tanpa gula", label: "Jus buah tanpa gula" },
  { value: "Jus buah berpemanis", label: "Jus buah berpemanis" },
  { value: "Jus buah kemasan", label: "Jus buah kemasan" },
  { value: "Teh manis", label: "Teh manis" },
  { value: "Sirup (air sirup)", label: "Sirup (air sirup)" },
  { value: "Minuman serbuk/sachet", label: "Minuman serbuk/sachet (Nutrisari, teh serbuk, dll)" },
  { value: "Minuman soda/soft drink", label: "Minuman soda / Soft drink" },
  { value: "Minuman isotonik/sport drink", label: "Minuman isotonik / Sport drink" },
];

export default function TrackerPage() {
  const { profile } = useUserStore();
  const { addIntake, records } = useHydrationStore();
  const today = new Date().toISOString().split("T")[0];
  
  const [drinkType, setDrinkType] = useState("Air putih/air matang");
  const [volume, setVolume] = useState<number>(250);
  
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSave = async () => {
    if (!profile) return;
    
    const todayRecord = records[today];
    const required = todayRecord?.required_intake_ml || 1500;

    const isSaved = await addIntake(profile.id, today, volume, drinkType, required, "sedang");

    if (isSaved) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    }
  };

  const todayRecord = records[today];

  return (
    <>
      <Header title="Catat Minum" />
      <div className="p-6 space-y-6">
        
        {showSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl flex items-center gap-3 animate-fade-in-up">
            <CheckCircle2 className="text-green-500" />
            <p className="font-semibold text-sm">Berhasil mencatat minum!</p>
          </div>
        )}

        <h3 className="font-bold text-slate-800 text-lg">Tambah Minuman</h3>
        
        <Card>
          <CardContent className="p-6 space-y-5">
            <Select
              label="Jenis Minuman"
              value={drinkType}
              onChange={(e) => setDrinkType(e.target.value)}
              options={DRINK_TYPES}
            />
            
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Volume (ml)</label>
              <div className="flex flex-wrap gap-2">
                {DRINK_VOLUMES.map(vol => (
                  <button
                    key={vol}
                    onClick={() => setVolume(vol)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      volume === vol 
                        ? "bg-blue-500 text-white shadow-md scale-105" 
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {vol}ml
                  </button>
                ))}
              </div>
            </div>

            <Button className="w-full mt-4 gap-2" size="lg" onClick={handleSave}>
              <Plus size={20} />
              Simpan Minum ({volume}ml)
            </Button>
          </CardContent>
        </Card>
        
        {todayRecord && (
          <div className="text-center mt-4">
            <p className="text-sm text-slate-500">
              Total tercatat hari ini: <span className="font-bold text-blue-600">{todayRecord.total_intake_ml}ml</span>
            </p>
          </div>
        )}

      </div>
    </>
  );
}
