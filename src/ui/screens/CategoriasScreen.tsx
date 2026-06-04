import { Plus, Trash2 } from 'lucide-react'
import { usePlanStore } from '../../state/planStore'

const NEW_COLORS = ['#e8923c', '#2e5bff', '#9b51e0', '#00a3a3', '#ff3b30', '#0e9f6e', '#8a857a']

export function CategoriasScreen() {
  const categories = usePlanStore((s) => s.categories)
  const addCategory = usePlanStore((s) => s.addCategory)
  const updateCategory = usePlanStore((s) => s.updateCategory)
  const deleteCategory = usePlanStore((s) => s.deleteCategory)

  return (
    <div className="space-y-4 pb-28">
      <p className="px-1 text-sm text-muted">
        Etiqueta tus gastos e ingresos con categorías y míralas en Gráficas. Toca el color o el
        nombre para editar.
      </p>

      <div className="space-y-2">
        {categories.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-chunky border-2 border-line bg-surface p-3 shadow-hard-sm"
          >
            <label
              className="relative h-7 w-7 shrink-0 rounded-lg border-2 border-line"
              style={{ background: c.color }}
            >
              <input
                type="color"
                defaultValue={c.color}
                onChange={(e) => void updateCategory({ ...c, color: e.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Color"
              />
            </label>
            <input
              defaultValue={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== c.name) void updateCategory({ ...c, name: v })
              }}
              className="min-w-0 flex-1 bg-transparent font-medium outline-none"
            />
            <button
              onClick={() => {
                if (window.confirm(`¿Borrar la categoría "${c.name}"?`)) void deleteCategory(c.id)
              }}
              aria-label="Borrar categoría"
              className="shrink-0 p-1 text-neg active:translate-y-0.5"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">Aún no tienes categorías.</p>
        )}
      </div>

      <button
        onClick={() =>
          void addCategory('Nueva categoría', NEW_COLORS[categories.length % NEW_COLORS.length])
        }
        className="flex w-full items-center justify-center gap-2 rounded-chunky border-2 border-dashed border-line/40 py-3 text-sm font-semibold text-muted active:bg-surface"
      >
        <Plus size={16} /> Agregar categoría
      </button>
    </div>
  )
}
