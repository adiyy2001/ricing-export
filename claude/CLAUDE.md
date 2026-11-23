# Zasady Adriana (wszystkie projekty)

- Odpowiadaj po polsku. Kod, nazwy, commity i PR-y po angielsku, zgodnie z repo.
- Kod bez komentarzy (również JSDoc i komentarzy w testach) i bez półpauz/pauz. Zamiast komentarza lepsza nazwa.
- Strukturę plików, nazewnictwo, branche i commity odwzorowuj z poprzednich commitów danego projektu (`git log`), nie wymyślaj własnych.
- Commity bez `Co-Authored-By` i innych stopek. Nie commituj, nie pushuj i nie twórz PR-ów bez wyraźnej prośby.
- Zanim ogłosisz koniec, zweryfikuj: typecheck, lint, testy, a przy UI zrzut ekranu porównany z projektem. Wyniki raportuj wprost, także porażki.
- Brakujące informacje najpierw szukaj w repo, notatkach i narzędziach projektu. Pytaj dopiero, gdy tam ich nie ma.

## Jakość

- Koniec ogłaszaj z dowodem (polecenie i wynik, test, zrzut). Co musi zajść zawsze, daj do hooka albo testu, nie do prozy.
- Testów nie osłabiaj: bez usuwania przypadków, nowych `.skip`/`.only`, luzowania asercji.
- Plan tylko przy zmianie wieloplikowej albo niepewnym podejściu. Recenzja w świeżym kontekście, zgłasza tylko błędy wpływające na poprawność albo wymagania.
- Przepływy UI sprawdzaj na działającej aplikacji, nie tylko testami jednostkowymi. Przy refaktorze porównaj zachowanie przed i po.
- Repo może mieć własny plik zasad ładowany z jego `CLAUDE.md`. Ma pierwszeństwo przed tą listą.

## Środowisko

- Node przez nvm (domyślnie 24).
- Serwerów dev nie zabijaj przez `pkill -f` (łapie powłokę Claude). Użyj `pgrep` i `kill <PID>`.

## Oszczędzanie tokenów

- Pełne zasady, pomiary i źródła: `~/.claude/token-efficiency.md`.
- Czytaj i wypisuj tylko to, co potrzebne: `grep`, `head`, `offset`/`limit`, wyjście testów i logów filtruj do błędów.
- CLI (`gh`, `az`, `git`, `curl`) zamiast MCP, gdy daje ten sam wynik.
- Subagenci i workflowy: najmniej agentów, ile wystarczy; Sonnet lub Haiku do zbierania i streszczania, Opus do syntezy; agent zwraca zwięzłe podsumowanie.
- Nie zmieniaj modelu ani zestawu MCP w trakcie sesji; inny model uruchamiaj przez subagenta.
- Gdy kontekst przekracza około 200k tokenów albo zmienia się temat, zaproponuj `/clear` lub `/compact` z instrukcją, co zachować.
- Odpowiadaj zwięźle, bez powtarzania kodu i treści, które użytkownik już widzi.
