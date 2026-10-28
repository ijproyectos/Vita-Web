# Evals de vita

Set fijo de ~23 preguntas para revisar a vita antes de cambiar el prompt o las tools. Los casos están en `casos.ts` (mensaje, contexto simulado y expectativas determinísticas: tools llamadas, fragmentos de argumentos, regex sobre el texto). Reusan el `SYSTEM_PROMPT` y las tools reales de la app; las tools se simulan, así que esto **no** prueba RLS ni guardado real.

## Cómo correrlo

```bash
cd apps/web
npm run evals                                   # dry-run: NO llama a la API; muestra el plan y el costo estimado
npm run evals -- --ejecutar                     # llama a Anthropic (cuesta plata real)
npm run evals -- --ejecutar --caso saludo       # un solo caso
npm run evals -- --ejecutar --max-usd 0.5       # corta al llegar al tope (default US$1)
```

- **Cuesta dinero.** Solo se llama a la API con `--ejecutar` y con `ANTHROPIC_API_KEY` en el entorno o en `apps/web/.env.local` (la clave nunca se imprime). Pedí aprobación antes de una corrida paga.
- Nunca corre en `npm test` ni en CI: `npm test` solo valida que los casos estén bien formados y que el evaluador funcione con respuestas falsas.
- Los casos marcados `aspiracional` son capacidades deseadas que hoy no están garantizadas: si fallan se avisan pero no cuentan como error.
- Con el caché de prompt, la primera vuelta escribe el prefijo (1.25x) y las siguientes lo leen (0.1x); el resumen final muestra los tokens y el costo estimado.
