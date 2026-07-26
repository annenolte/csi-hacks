import { PRODUCT_NAME } from "@/lib/brand";

/*
  Where the reference photographs a laptop, we draw the thing itself.

  A screenshot goes stale the moment the dashboard changes and a stock photo
  says nothing; this is the real screen's own tokens, tabs and card geometry at
  a smaller size. It is a picture, not a component reused from the dashboard —
  the numbers are illustrative — so it says so in its own label.
*/
export default function DashboardMock() {
  return (
    <figure
      role="img"
      aria-label={`An illustration of the ${PRODUCT_NAME} dashboard: an agent phone number, a connected calendar, and rows of what the agent learned from the business's own documents.`}
      className="overflow-hidden rounded-[24px] border border-line bg-canvas shadow-pop"
    >
      <div aria-hidden="true" className="select-none">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-line bg-paper/80 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="ml-3 rounded-full bg-canvas px-3 py-1 text-[10.5px] text-faint">
            {PRODUCT_NAME.toLowerCase()}.app/dashboard
          </span>
        </div>

        <div className="p-5 sm:p-7">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1.5">
            {["Overview", "Knowledge", "Documents"].map((tab, i) => (
              <span
                key={tab}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium ${
                  i === 0 ? "bg-ink text-white" : "bg-paper text-muted"
                }`}
              >
                {tab}
              </span>
            ))}
          </div>

          {/* The number */}
          <div className="mt-4 rounded-[var(--radius-card)] border border-line bg-paper p-6 text-center shadow-lift">
            <p className="text-[10px] uppercase tracking-[0.09em] text-muted">
              Your agent&apos;s number
            </p>
            <p className="display mt-1.5 text-[30px] sm:text-[38px]">(415) 555-0142</p>
            <span className="mt-3 inline-flex rounded-full border border-line px-3.5 py-1.5 text-[11.5px] text-ink-soft">
              Copy number
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {/* Calendar */}
            <div className="rounded-[var(--radius-card)] border border-line bg-paper p-5 shadow-lift">
              <p className="text-[13px] font-medium text-ink">Calendar</p>
              <p className="mt-2 flex items-center gap-2 text-[12px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-script-green" />
                Google Calendar connected
              </p>
              <p className="mt-1 text-[12px] text-faint">Next free slot: Tue 8:30am</p>
            </div>

            {/* Documents */}
            <div className="rounded-[var(--radius-card)] border border-line bg-paper p-5 shadow-lift">
              <p className="text-[13px] font-medium text-ink">Documents</p>
              <ul className="mt-2 space-y-1.5">
                {[
                  ["price-list.pdf", "PDF"],
                  ["service-area.docx", "DOCX"],
                  ["after-hours.txt", "TXT"],
                ].map(([name, kind]) => (
                  <li key={name} className="flex items-center gap-2 text-[12px] text-muted">
                    <span className="rounded bg-canvas px-1.5 py-0.5 text-[9.5px] font-medium text-ink-soft">
                      {kind}
                    </span>
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Knowledge rows */}
          <div className="mt-3 rounded-[var(--radius-card)] border border-line bg-paper shadow-lift">
            {[
              ["Hours", "Mon–Fri 7am–6pm, Sat 8am–2pm", "From your website"],
              ["Service area", "Oakland, Berkeley, Alameda, San Leandro", "From price-list.pdf"],
              ["Drain unblock", "$180 flat", "From price-list.pdf"],
              ["Sewer line", "Always a human", "Trade rule"],
            ].map(([label, value, source], i) => (
              <div
                key={label}
                className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3.5 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <span className="w-[104px] shrink-0 text-[12px] text-muted">{label}</span>
                <span className="text-[12.5px] text-ink">{value}</span>
                <span className="ml-auto text-[11px] text-faint">{source}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
