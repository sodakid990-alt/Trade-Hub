import type { Guardrail } from '../lib/guardrails'

export function GuardrailList({ items }: { items: Guardrail[] }) {
  return (
    <div className="guardrails">
      {items.map((g) => (
        <div key={g.key} className={`guardrail ${g.level}`}>
          <div className="row">
            <span>{g.label}</span>
            <div className="spacer" />
            <span className="muted small">{g.detail}</span>
          </div>
          <div className="bar"><div className="fill" style={{ width: `${Math.min(100, g.used * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  )
}
