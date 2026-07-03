import { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { postJson, del } from '../lib/api.js';

/** 양식 선택 + 커스텀 양식 저장/삭제 (프리셋에서 파생 저장, 설계서 §7.1) */
export default function TemplateManager({ templates, current, onApply, onChanged }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const applyById = (value) => {
    const all = [...templates.presets, ...templates.mine];
    const found = all.find((t) => String(t.id) === value);
    if (found) onApply(structuredClone(found.style));
  };

  async function saveAsNew() {
    const name = prompt('저장할 양식 이름:', `${current.name} 사본`);
    if (!name) return;
    setSaving(true);
    setMessage(null);
    try {
      await postJson('/api/templates', { name, style: { ...current, name } });
      await onChanged();
      setMessage(`"${name}" 저장됨`);
    } catch (err) {
      setMessage(err.issues ? `저장 실패: ${err.issues[0]?.path} ${err.issues[0]?.message}` : `저장 실패: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(id, name) {
    if (!confirm(`"${name}" 양식을 삭제할까요?`)) return;
    await del(`/api/templates/${id}`);
    await onChanged();
  }

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2.5">양식</h3>

      <select className="input-underline mb-2" defaultValue="" onChange={(e) => applyById(e.target.value)}>
        <option value="" disabled>양식 선택…</option>
        <optgroup label="내장 프리셋">
          {templates.presets.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </optgroup>
        {templates.mine.length > 0 && (
          <optgroup label="내 양식">
            {templates.mine.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </optgroup>
        )}
      </select>

      <div className="flex items-center gap-2">
        <button className="btn-secondary !py-1 !px-2.5 text-xs" onClick={saveAsNew} disabled={saving}>
          <Save size={13} aria-hidden /> 현재 설정을 양식으로 저장
        </button>
      </div>

      {templates.mine.length > 0 && (
        <ul className="mt-2 space-y-1">
          {templates.mine.map((t) => (
            <li key={t.id} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="flex-1 truncate">{t.name}</span>
              <button
                className="p-1 rounded hover:bg-surface"
                title={`${t.name} 삭제`}
                onClick={() => removeTemplate(t.id, t.name)}
              >
                <Trash2 size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && <p className="mt-1.5 text-xs text-muted">{message}</p>}
    </section>
  );
}
