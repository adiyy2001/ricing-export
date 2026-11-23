# Oszczędzanie tokenów w Claude Code

Obowiązuje na tym komputerze niezależnie od konta (subskrypcja, klucz API, inna organizacja). Stan na 2026-09-28, Claude Code 2.1.283.

## Skąd bierze się zużycie

- Każde zapytanie wysyła cały kontekst od nowa. Odczyt z cache jest tani (Opus 5.5: 0,05 ceny wejścia, reszta modeli 0,1), zapis do cache kosztuje 1,25 (TTL 5 min) albo 2 (TTL 1 h), a wyjście razem z myśleniem 5 razy więcej niż wejście. [pricing]
- W praktyce: koszt ≈ rozmiar kontekstu × liczba zapytań + ponowne zapisy po zerwaniu cache + myślenie.
- Opus 5.5 ma natywne okno 1M i domyślnie kompaktuje dopiero przy około 967k tokenów, więc sesja rośnie prawie do końca okna. [model-config]

## Pomiar na tym komputerze (26 do 28.09.2026)

| Rodzaj | Zapytania | Koszt wg cennika API | Udział |
| --- | --- | --- | --- |
| Główne sesje | 817 | 149 $ | 51% |
| Workflowy (82 agentów, 12 uruchomień) | 2980 | 135 $ | 46% |
| Subagenci | 163 | 9 $ | 3% |
| Razem | 3960 | 293 $ | 100% |

- Tokeny: odczyt cache 719M, zapis cache 19M (w tym 6M z TTL 1 h), wyjście 1,3M. Koszt: odczyty 51%, zapisy 40%, wyjście 9%.
- Jedna sesja (27a3cad3 w `~`) z workflowami dała 72% całości. Jej kontekst na zapytanie: mediana 526k, p90 867k, maks. 964k. Przy limicie 300k odpadłoby co najmniej 46% tokenów wejścia tej sesji.
- Agent workflow startuje od około 33k tokenów i rośnie do mediany 138k w 32 zapytaniach. Wszystkie działały na Opus 5.5 (dziedziczony model sesji).
- Pusta sesja w `~` to około 40k tokenów. CLAUDE.md (15 linii) i pamięć (7,8 KB) nie są problemem.
- Ustawienia: `model: opus` (Opus 5.5), `modelSettings.claude-opus-5-5.effortLevel: xhigh` (domyślnie Opus 5.5 ma `medium`), 5 serwerów MCP użytkownika, 10 konektorów claude.ai (8 bez logowania), 8 pluginów.

## Zasady według oszczędności

1. **Jedna sesja na jeden temat, `/clear` między niepowiązanymi zadaniami.** Przed czyszczeniem `/rename`, potem `/resume`. Powód: pytanie w sesji z 500k kontekstu kosztuje odczyt 500k przy każdym wywołaniu narzędzia. `/clear` nic nie kosztuje. [costs#manage-context-proactively, costs#why-usage-climbs-in-a-long-session]
2. **Ogranicz okno auto-compact do 300k.** `"autoCompactWindow": 300000` w settings.json albo `/autocompact`. W zmiennej `CLAUDE_CODE_AUTO_COMPACT_WINDOW` tylko liczba całkowita: `500k` zostanie odczytane jako 500. Powód: kontekst ponad 300k to u Ciebie połowa kosztu sesji, a jakość i tak spada przy długim kontekście. [settings-reference#autocompactwindow, env-vars, best-practices, context engineering]
3. **Sam kompaktuj w naturalnych przerwach**, z instrukcją: `/compact zachowaj decyzje, ścieżki plików, otwarte problemy`. Gdy porzucasz ścieżkę, użyj `/rewind` zamiast `/compact`, bo wraca do prefiksu, który już jest w cache. [prompt-caching#compacting-the-conversation]
4. **Workflowy i subagenci: mniej agentów i tańszy model dla prostych etapów.** `"workflowSizeGuideline": "small"` (poniżej 5 agentów), w poleceniu wskazuj Sonnet albo Haiku dla etapów zbierania i streszczania, Opus tylko dla syntezy i weryfikacji. Globalnie: `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`. Agent ma zwracać zwięzłe podsumowanie (1 do 2k tokenów), nie surowe dane. Powód: workflowy to 46% zużycia, każdy agent buduje własny cache od zera z TTL 5 min. [workflows#cost, sub-agents#choose-a-model, prompt-caching#subagents-and-the-cache, context engineering]
5. **Effort dopasowany do zadania.** Domyślnie `high` albo `medium` (domyślne dla Opus 5.5), `xhigh` lub `max` tylko do trudnej architektury i debugowania. Myślenie liczy się jako wyjście, a `max` ma skłonność do przemyślania. Na Opus 5.5 zmiana effort w trakcie nie zrywa cache. [model-config#adjust-effort-level, costs#adjust-extended-thinking, prompt-caching#changing-effort-level]
6. **Model dobieraj na starcie sesji i nie przełączaj w trakcie.** Sonnet 5 do rutyny (2 $/10 $ zamiast 4 $/20 $ za MTok), Opus do złożonych zadań. Każdy model ma własny cache, więc `/model` w połowie długiej sesji przelicza cały kontekst od zera. Lepiej oddać zadanie subagentowi z innym modelem. `opusplan` przełącza model przy każdym wejściu i wyjściu z plan mode. [costs#choose-the-right-model, prompt-caching#switching-models, blog prompt caching]
7. **Uważaj na przerwy dłuższe niż TTL cache.** Subskrypcja: 1 h dla głównej sesji, 5 min dla subagentów. API i usage credits: 5 min. Pierwsze zapytanie po przerwie zapisuje cały kontekst od nowa (u Ciebie 1h zapisy to 32% kosztu głównych sesji). Przed dłuższą przerwą zrób `/clear` albo przyjmij propozycję wznowienia z podsumowania. Na kluczu API z przerwami 5 do 60 min ustaw `"promptCacheTtl": "1h"`. [prompt-caching#cache-lifetime, costs#why-usage-climbs-in-a-long-session]
8. **Nie zmieniaj w trakcie sesji zestawu MCP, pluginów ani reguł deny na całe narzędzia.** Zmiany konfiguracji wprowadzaj między sesjami. [prompt-caching#actions-that-invalidate-the-cache]
9. **Ograniczaj wyjście narzędzi.** `grep`, `head`, `tail`, `--quiet`, czytanie plików z `offset` i `limit`, filtr testów przez hook (tylko błędy). Limity: Bash 30 000 znaków (`BASH_MAX_OUTPUT_LENGTH`), MCP 25 000 tokenów (`MAX_MCP_OUTPUT_TOKENS`). Każdy wynik zostaje w kontekście do końca sesji. [costs#offload-processing-to-hooks-and-skills, env-vars]
10. **CLI zamiast MCP, gdy jest CLI** (`gh`, `az`, `git`, `curl`). Wyłącz serwery i konektory, których nie używasz (`/mcp`, `deniedMcpServers`, `disableClaudeAiConnectors`). Narzędzia MCP są odroczone, ale nazwy i instrukcje serwerów trafiają do każdego zapytania każdej sesji i agenta. [costs#reduce-mcp-server-overhead, mcp, settings-reference#deniedmcpservers]
11. **Precyzyjne polecenia.** Nazwa pliku, funkcji i oczekiwany wynik zamiast „popraw kod”. Plan mode przed dużą zmianą, Esc od razu, gdy Claude idzie w złą stronę, cel weryfikacji (test, zrzut). [costs#write-specific-prompts, costs#work-efficiently-on-complex-tasks, best-practices]
12. **CLAUDE.md krótki (poniżej 200 linii), procedury w skillach.** Skill ładuje się dopiero przy użyciu, CLAUDE.md w każdej sesji i u każdego subagenta. Reguły dla części repo przez `paths:`. [memory, costs#move-instructions-from-claudemd-to-skills]
13. **Pluginy LSP dla kodu typowanego** (masz TypeScript i Pyright). Jedno „go to definition” zamiast grep i czytania kilku plików. [costs#install-code-intelligence-plugins-for-typed-languages]
14. **Tryb headless (`claude -p`) w skryptach:** `--model sonnet`, `--strict-mcp-config --mcp-config`, `--tools` z minimalną listą, `--max-turns`, `--no-session-persistence`. `--bare` pomija CLAUDE.md, MCP i hooki, ale działa tylko z kluczem API, nie z subskrypcją. [headless]
15. **Tło:** podpowiedzi promptów (`promptSuggestionEnabled`) wysyłają po każdej odpowiedzi małe zapytanie z pełnym kontekstem; `/loop`, zadania cykliczne i wiadomości między sesjami też wysyłają cały kontekst. W dużych sesjach ich unikaj. [costs#background-token-usage, costs#why-usage-climbs-in-a-long-session]

## Czego nie robić

- Nie wyłączaj prompt caching (`DISABLE_PROMPT_CACHING`) ani tool search (`ENABLE_TOOL_SEARCH=false`): oba podnoszą koszt.
- `MAX_THINKING_TOKENS` nie działa na modelach z adaptacyjnym myśleniem (Opus 5.5 zawsze myśli). Steruj przez effort.
- Przełączenie na tańszy model w połowie dużej sesji bywa droższe niż dokończenie na obecnym.

## Kontrola zużycia

- `/usage`: limity planu, udział skilli, subagentów i serwerów MCP, flagi „long context” i „cache misses”, linia `Prompt cache (main)`. Przełącznik `d` i `w` (24 h i 7 dni).
- `/context`: co zajmuje kontekst teraz.
- Statusline: skrypt `~/.claude/statusline.sh` (model, effort, rozmiar kontekstu, limity 5 h i 7 dni). Podpięcie w sekcji niżej.
- Lokalnie: `/session-report` (plugin zainstalowany) albo `npx ccusage@latest daily`.

## Proponowany blok settings.json

Zastosowane 2026-09-28: usunięty serwer Reclaim (lista oczekujących, każde narzędzie zwraca „not yet available”). Kopia plików w `~/.claude/backups/token-efficiency-2026-09-28/`.

Do decyzji (nie zastosowane), dodaj do `~/.claude/settings.json`:

```json
{
  "autoCompactWindow": 300000,
  "workflowSizeGuideline": "small",
  "promptSuggestionEnabled": false,
  "statusLine": { "type": "command", "command": "~/.claude/statusline.sh" },
  "deniedMcpServers": [
    { "serverName": "claude.ai Notion" }, { "serverName": "claude.ai monday.com" },
    { "serverName": "claude.ai Linear" }, { "serverName": "claude.ai Intercom" },
    { "serverName": "claude.ai HubSpot" }, { "serverName": "claude.ai Canva" },
    { "serverName": "claude.ai Box" }, { "serverName": "claude.ai Atlassian" }
  ],
  "modelSettings": { "claude-opus-5-5": { "effortLevel": "high" } },
  "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet" }
}
```

Na koncie API dodatkowo rozważ `"promptCacheTtl": "1h"` i `"model": "sonnet"` jako domyślny.

## Limity subskrypcji (research 2026-09-28)

- Dwa okna: kroczące 5 h (start przy pierwszej wiadomości) i tygodniowe. Max i Team mają osobny tygodniowy limit Opus: komunikat „Opus limit” znaczy, że `/model` z Sonnetem pozwala pracować dalej; „session limit” i „weekly limit” są wspólne dla modeli. [costs]
- Statusline dostaje `rate_limits.five_hour`, `seven_day` i `spend_limit` (`used_percentage`, `resets_at` w sekundach epoki), tylko na Pro i Max, po pierwszej odpowiedzi w sesji. `~/.claude/statusline.sh` zapisuje je do `~/.local/share/command-center/plan-limits.json`, a Command Center (`/usage`, karta „Limity planu”) liczy tempo i prognozę. [statusline]
- Endpoint `api.anthropic.com/api/oauth/usage` jest nieudokumentowany; nie używamy go.
- Po wyczerpaniu limitu Claude Code może sam wznowić zadanie po resecie: `/rate-limit-options` (ustawienie `autoContinueAtUsageLimit`, od 2.1.234). [costs]
- Na usage credits TTL cache spada z 1 h do 5 min. [costs]
- `/compact` sam czyta całą rozmowę, więc kosztuje; `/clear` nic. [costs]
- Społeczność: pierwszą wiadomość dnia wysłać wcześnie, żeby okno 5 h zresetowało się przed najcięższym blokiem. Brief o 8:30 (`claude -p`) już otwiera okno, więc w dni robocze reset wypada ok. 13:30. Throttling w godzinach szczytu zniesiono w maju 2026.

## Źródła

- [costs] https://code.claude.com/docs/en/costs
- [prompt-caching] https://code.claude.com/docs/en/prompt-caching
- [model-config] https://code.claude.com/docs/en/model-config
- [settings-reference] https://code.claude.com/docs/en/settings-reference
- [env-vars] https://code.claude.com/docs/en/env-vars
- [sub-agents] https://code.claude.com/docs/en/sub-agents
- [workflows] https://code.claude.com/docs/en/workflows
- [mcp] https://code.claude.com/docs/en/mcp
- [memory] https://code.claude.com/docs/en/memory
- [headless] https://code.claude.com/docs/en/headless
- [statusline] https://code.claude.com/docs/en/statusline
- [best-practices] https://code.claude.com/docs/en/best-practices
- [pricing] https://platform.claude.com/docs/en/about-claude/pricing
- [blog prompt caching] https://claude.dev/blog/lessons-from-building-claude-code-prompt-caching-is-everything/
- [context engineering] https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- [ccusage] https://github.com/ryoppippi/ccusage
