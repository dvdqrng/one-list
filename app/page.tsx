import { TodoApp } from "@/components/todo-app"

export default function Page() {
  return (
    <main className="min-h-screen bg-background p-4 md:p-8 font-sans">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-balance mb-2">Intelligent Todo</h1>
          <p className="text-muted-foreground text-pretty">
            Add tasks naturally. AI understands and organizes them for you.
          </p>
        </div>
        <TodoApp />
      </div>
    </main>
  )
}
