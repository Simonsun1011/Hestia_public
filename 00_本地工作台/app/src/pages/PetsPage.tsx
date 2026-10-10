import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, PawPrint, Star } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, Empty, Kicker, SourceLink, fmtDate, jsonFetch } from "../page-shared";

type Care = { file: string; errors: string[]; title: string; date: string | null; kind: string; kindLabel: string; product?: string | null; vet?: string | null; cost?: number | null; weightKg?: number | null; nextDue?: string | null; note: string };
type Supply = { file: string; errors: string[]; title: string; kind: string; kindLabel: string; brand?: string | null; status: string; statusLabel: string; started?: string | null; rating?: number | null; note: string };
type Pet = {
  slug: string;
  profile: { name: string; species: string | null; breed: string | null; sex: string | null; neutered: boolean | null; birthday: string | null; adopted: string | null; age: string | null; note: string } | null;
  profileErrors: string[];
  care: Care[];
  supplies: Supply[];
  weights: Array<{ date: string; kg: number }>;
  due: Array<{ kind: string; kindLabel: string; title: string; nextDue: string; overdue: boolean }>;
};
type PetsSnapshot = { today: string; pets: Pet[]; sourceDir: string };

const chartTooltip = { contentStyle: { background: "var(--surface-2, #0e191c)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 11 }, labelStyle: { color: "var(--gold)" } };
const CARE_FILTERS = [["all", "全部"], ["checkup", "体检"], ["vaccine", "疫苗"], ["deworm", "驱虫"], ["weigh", "称重"], ["illness", "就医"]] as const;

function WeightChart({ weights }: { weights: Pet["weights"] }) {
  if (weights.length < 2) return null;
  const data = weights.map((point) => ({ ...point, label: point.date.slice(5).replace("-", "/") }));
  return (
    <Card className="pet-weight">
      <Kicker>体重</Kicker>
      <h3>{weights.at(-1)!.kg} kg</h3>
      <div className="pet-weight-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" stroke="var(--quiet)" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis domain={["dataMin - 0.3", "dataMax + 0.3"]} stroke="var(--quiet)" tickLine={false} axisLine={false} width={36} fontSize={11} tickFormatter={(value) => Number(value).toFixed(1)} />
            <Tooltip {...chartTooltip} formatter={(value) => [`${value} kg`, "体重"]} />
            <Line type="monotone" dataKey="kg" stroke="var(--teal)" strokeWidth={2} dot={{ r: 4, strokeWidth: 0, fill: "var(--teal)" }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function PetView({ pet, sourceDir }: { pet: Pet; sourceDir: string }) {
  const [filter, setFilter] = useState<string>("all");
  const profile = pet.profile;
  const care = pet.care.filter((item) => filter === "all" || item.kind === filter);
  const groups = [...new Set(pet.supplies.map((item) => item.kindLabel))];
  const facts = profile ? [
    profile.species && profile.breed ? `${profile.species} · ${profile.breed}` : profile.species ?? profile.breed,
    profile.sex ? `${profile.sex}${profile.neutered ? " · 已绝育" : profile.neutered === false ? " · 未绝育" : ""}` : null,
    profile.age ? `${profile.age}${profile.birthday ? `（${profile.birthday} 生）` : ""}` : null,
    profile.adopted ? `${profile.adopted} 到家` : null,
  ].filter(Boolean) : [];
  return (
    <div className="pets-layout">
      <Card className="pet-profile">
        <div className="pet-avatar" aria-hidden="true"><PawPrint size={30} /></div>
        <div>
          <Kicker>档案</Kicker>
          <h2>{profile?.name ?? pet.slug}</h2>
          {facts.length ? <ul className="pet-facts">{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : null}
          {profile?.note ? <p>{profile.note}</p> : null}
          {pet.profileErrors.length ? <p className="pet-errors"><AlertTriangle size={13} />{pet.profileErrors.join("；")}</p> : null}
        </div>
        <SourceLink path={`${sourceDir}/${pet.slug}/档案.md`} />
      </Card>
      {pet.due.length ? (
        <Card className="pet-due">
          <Kicker>快到期</Kicker>
          <ul>
            {pet.due.map((item) => (
              <li key={item.kind} className={item.overdue ? "is-overdue" : ""}>
                <CalendarClock size={14} /><strong>{item.kindLabel}</strong><span>{item.overdue ? "已过" : ""} {fmtDate(item.nextDue)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <WeightChart weights={pet.weights} />
      <Card className="pet-care">
        <div className="pet-section-head">
          <div><Kicker>护理与就医</Kicker><h3>{pet.care.length} 条记录</h3></div>
          <div className="japan-activity-filters" role="group" aria-label="按类别筛选">
            {CARE_FILTERS.map(([key, label]) => <button type="button" key={key} className={filter === key ? "is-active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}><span>{label}</span></button>)}
          </div>
        </div>
        {care.length ? (
          <ol className="pet-care-list">
            {care.map((item) => (
              <li key={item.file}>
                <time>{item.date ? fmtDate(item.date) : "日期缺失"}</time>
                <div>
                  <strong>{item.title}</strong><span className="pet-chip">{item.kindLabel}</span>
                  <small>{[item.product, item.vet, item.weightKg != null ? `${item.weightKg} kg` : null, item.cost != null ? `¥${item.cost.toLocaleString("ja-JP")}` : null, item.nextDue ? `下次 ${item.nextDue}` : null].filter(Boolean).join(" · ")}</small>
                  {item.note ? <p>{item.note}</p> : null}
                  {item.errors.length ? <p className="pet-errors"><AlertTriangle size={13} />{item.errors.join("；")}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : <Empty>没有这一类记录</Empty>}
      </Card>
      <Card className="pet-supplies">
        <Kicker>用品</Kicker>
        <h3>{pet.supplies.filter((item) => item.status === "using").length} 款在用</h3>
        {groups.map((group) => (
          <div key={group} className="pet-supply-group">
            <h4>{group}</h4>
            <ul>
              {pet.supplies.filter((item) => item.kindLabel === group).map((item) => (
                <li key={item.file} className={`is-${item.status}`}>
                  <div><strong>{item.title}</strong><span className="pet-chip">{item.statusLabel}</span></div>
                  {item.rating ? <span className="pet-rating" aria-label={`${item.rating} 星`}>{Array.from({ length: item.rating }, (_, index) => <Star key={index} size={11} fill="currentColor" />)}</span> : null}
                  {item.note ? <p>{item.note}</p> : null}
                  {item.errors.length ? <p className="pet-errors"><AlertTriangle size={13} />{item.errors.join("；")}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!pet.supplies.length ? <Empty>还没有用品记录</Empty> : null}
      </Card>
    </div>
  );
}

export default function PetsPage() {
  const [data, setData] = useState<PetsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    jsonFetch<PetsSnapshot>("/api/pets").then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : "读取失败"));
  }, []);
  if (error) return <div className="route-error"><AlertTriangle size={18} /><div><strong>宠物记录没读到</strong><p>{error}</p></div></div>;
  if (!data) return <div className="route-skeleton" aria-label="正在载入页面" />;
  if (!data.pets.length) return <Empty>{`在 ${data.sourceDir}/ 下建一个宠物目录就会出现在这里`}</Empty>;
  const pet = data.pets.find((item) => item.slug === current) ?? data.pets[0];
  return (
    <div className="pets-page">
      {data.pets.length > 1 ? (
        <div className="japan-activity-filters pets-switch" role="tablist" aria-label="选择宠物">
          {data.pets.map((item) => <button type="button" role="tab" key={item.slug} aria-selected={item.slug === pet.slug} className={item.slug === pet.slug ? "is-active" : ""} onClick={() => setCurrent(item.slug)}><span>{item.profile?.name ?? item.slug}</span></button>)}
        </div>
      ) : null}
      <PetView pet={pet} sourceDir={data.sourceDir} />
    </div>
  );
}
