import { meterKey, SUPPORTED_METERS, type Meter } from "../music/meter";

const meterDetails: Record<string, { name: string; clap: string }> = {
  "2/4": { name: "두 박자", clap: "강 · 약" },
  "3/4": { name: "세 박자", clap: "강 · 약 · 약" },
  "4/4": { name: "네 박자", clap: "강 · 약 · 중강 · 약" },
  "6/8": { name: "두 덩어리 박자", clap: "하나둘셋 · 넷다섯여섯" }
};

export default function ComposerMeterChooser({ meter, onSelect }: Readonly<{
  meter: Meter;
  onSelect: (meter: Meter) => void;
}>) {
  return (
        <section className="meter-chooser composer-setting-card" aria-labelledby="meter-heading">
          <div className="compact-heading">
            <span className="number-badge">3</span>
            <div><h2 id="meter-heading">박자</h2></div>
          </div>
          <div className="meter-options">
            {SUPPORTED_METERS.map((item) => {
              const key = meterKey(item);
              const detail = meterDetails[key];
              const active = key === meterKey(meter);
              return (
                <button key={key} type="button" data-testid={`meter-${item.beats}-${item.beatUnit}`}
                  className={active ? "meter-option active" : "meter-option"}
                  aria-pressed={active} onClick={() => onSelect(item)}>
                  <strong>{key}</strong><span>{detail.name}</span>
                </button>
              );
            })}
          </div>
        </section>
  );
}
