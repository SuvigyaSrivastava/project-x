import type { ProfileData } from "@/lib/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}

export function ProfileView({ data }: { data: ProfileData }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl w-full">
      <div className="flex items-center gap-4 mb-4">
        {data.profilePicture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.profilePicture.original} alt={data.fullName ?? "Profile"} className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
            No photo
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold">{data.fullName ?? "Unknown"}</h2>
          {data.headline && <p className="text-gray-600 text-sm">{data.headline}</p>}
          {data.location.full && <p className="text-gray-400 text-xs mt-0.5">{data.location.full}</p>}
        </div>
      </div>

      {data.followersCount !== null && (
        <p className="text-xs text-gray-500 mb-4">{data.followersCount.toLocaleString()} followers</p>
      )}

      {data.summary && (
        <Section title="About">
          <p className="text-sm text-gray-700 whitespace-pre-line">{data.summary}</p>
        </Section>
      )}

      {data.experience.length > 0 && (
        <Section title="Experience">
          <ul className="space-y-3">
            {data.experience.map((exp, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">{exp.title ?? "—"}</p>
                <p className="text-gray-600">
                  {exp.companyName}
                  {exp.employmentType ? ` · ${exp.employmentType}` : ""}
                </p>
                {exp.dateRange && <p className="text-gray-400 text-xs">{exp.dateRange.text}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.education.length > 0 && (
        <Section title="Education">
          <ul className="space-y-3">
            {data.education.map((edu, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">{edu.schoolName ?? "—"}</p>
                <p className="text-gray-600">
                  {edu.degreeName}
                  {edu.fieldOfStudy ? ` · ${edu.fieldOfStudy}` : ""}
                </p>
                {edu.dateRange && <p className="text-gray-400 text-xs">{edu.dateRange.text}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.skills.length > 0 && (
        <Section title="Skills">
          <div className="flex flex-wrap gap-2">
            {data.skills.map((s, i) => (
              <span key={i} className="text-xs bg-gray-100 rounded-full px-3 py-1 text-gray-700">
                {s.name}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
