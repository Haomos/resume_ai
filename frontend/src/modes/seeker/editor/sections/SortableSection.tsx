import type { ReactNode } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableItem({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 cursor-grab p-1 text-slate-400 hover:text-slate-600" {...attributes} {...listeners}>
        ⋮⋮
      </div>
      <div className="pl-6">{children}</div>
    </div>
  )
}

export function SortableSection<T>({
  items,
  onReorder,
  renderItem,
}: {
  items: T[]
  onReorder: (oldIndex: number, newIndex: number) => void
  renderItem: (item: T, index: number) => ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((_, i) => String(i) === active.id)
      const newIndex = items.findIndex((_, i) => String(i) === over.id)
      if (oldIndex !== -1 && newIndex !== -1) onReorder(oldIndex, newIndex)
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((_, i) => String(i))} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => (
          <SortableItem key={String(i)} id={String(i)}>
            {renderItem(item, i)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  )
}
