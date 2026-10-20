function App() {
  return (
    <main className="min-h-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center gap-4 px-6">
      <h1 className="text-4xl font-bold tracking-tight">Morpheus</h1>
      <p className="text-green-300 text-center max-w-xl">
        Gate de validación para subidas al monolito — cola serializada,
        ventana de validación, sin testigo humano.
      </p>
      <span className="text-xs text-green-600 uppercase tracking-widest">
        gate:pending
      </span>
    </main>
  )
}

export default App
