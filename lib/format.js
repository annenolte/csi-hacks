import { FIELD_TYPES, optionsForNeed } from "./trades";

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABEL = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function to12Hour(hhmm) {
  const [h, m] = (hhmm ?? "").split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

/*
  Collapses consecutive days that share the same window, so the slip reads
  "Mon–Fri 8am–5pm, Sat 9am–1pm" instead of seven lines.
*/
function formatHours(hours) {
  const open = DAY_ORDER.filter((d) => hours[d]);
  if (open.length === 0) return "Closed all week";

  const runs = [];
  for (const day of open) {
    const window = `${hours[day].open}-${hours[day].close}`;
    const last = runs.at(-1);
    const contiguous =
      last && DAY_ORDER.indexOf(day) === DAY_ORDER.indexOf(last.end) + 1;
    if (last && last.window === window && contiguous) {
      last.end = day;
    } else {
      runs.push({ start: day, end: day, window });
    }
  }

  return runs
    .map((run) => {
      const span =
        run.start === run.end
          ? DAY_LABEL[run.start]
          : `${DAY_LABEL[run.start]}–${DAY_LABEL[run.end]}`;
      const [from, to] = run.window.split("-");
      return `${span} ${to12Hour(from)}–${to12Hour(to)}`;
    })
    .join(", ");
}

/** Human-readable rendering of any need's value, driven by type alone. */
export function formatNeedValue(trade, need, value) {
  if (value === null || value === undefined || value === "") return null;

  switch (need.type) {
    case FIELD_TYPES.HOURS:
      return formatHours(value);

    case FIELD_TYPES.MONEY:
      return `$${value}`;

    case FIELD_TYPES.CHIPS:
      return value.length ? value.join(", ") : null;

    case FIELD_TYPES.CHOICE: {
      const options = optionsForNeed(trade, need);
      const labelFor = (v) =>
        options.find((o) => o.value === v)?.label ?? v;
      if (need.multiple) {
        return value.length ? value.map(labelFor).join(", ") : null;
      }
      return labelFor(value);
    }

    default:
      return String(value);
  }
}
