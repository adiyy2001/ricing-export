# Fabryka: konduktor kolejek dla Claude Code

Instrukcja dla Claude Code na nowej maszynie. Cel: postawić tę samą mechanikę pracy bez nadzoru, której używamy na CachyOS. Kolejka pozycji, każda pozycja w świeżej sesji `claude -p`, mechaniczna bramka jako sędzia, commit dopiero po bramce, a to, czego się nie da zrobić, ląduje jako plik `blocked` zamiast zgadywania.

Katalog `kit/` to gotowy zestaw do wgrania w korzeń dowolnego repo. Wymaga Node 24, `git`, `jq`, `flock` i zalogowanego Claude Code na subskrypcji. Nie ma zależności z npm.

## Zasady, których mechanika pilnuje

- Jedna pozycja to jedna świeża sesja. Sesja nie widzi poprzednich i nie commituje.
- Sesja zmienia tylko pliki z pola `files`. Zmiana poza zakresem, w pliku chronionym (`factory/`, `waves/`, `.claude/`, bramka) albo w zależnościach bez zgody blokuje pozycję przed bramką.
- Kod produkcyjny bez nowego przypadku testowego nie przechodzi. Usunięty test, `.skip`, `.only` i `@Disabled` nie przechodzą.
- Bramka pada: ta sama sesja dostaje ogon logu i poprawia, najwyżej 3 razy. Potem `blocked` i commit `unfinished work`, żeby praca nie zginęła.
- Sesja kończy linią `BLOCKED: <powód>`, gdy brakuje decyzji właściciela albo pliku spoza zakresu. Kolejka idzie dalej tym, co od tej pozycji nie zależy.
- Recenzja (`kind: review`) to osobna sesja na Opusie bez prawa zapisu. Zwraca JSON z blokerami, każdy z plikiem i linią. Blokery dostaje sesja naprawcza, najwyżej 2 rundy.
- Tylko subskrypcja. Konduktor usuwa `ANTHROPIC_API_KEY` ze środowiska sesji, a gdy sesja mimo to wystartuje na kluczu API, kończy pracę kodem 2. Przy zużyciu tygodniowym od 95% albo przy starej migawce nie startuje żadnej sesji.
- Sesja nie ma sieci ani MCP, a hooki użytkownika są w niej wyłączone. Zakazane polecenia wymienia stała `DENIED_BASH` w `kit/factory/run.mjs`: wypychanie i commitowanie w git, cofanie i czyszczenie drzewa roboczego, zdalne powłoki i kopiowanie, `sudo`, `systemctl`, `pkill`, rekurencyjne usuwanie, `docker`.
- Fabryka pushuje wyłącznie do zdalnego `hub` na gałęzie `build/*`. Do `origin` i `main` nie pisze nigdy, to robi człowiek po przeglądzie.

## Układ na dysku

Konduktor przełącza gałęzie i dodaje do commita wszystko z drzewa roboczego, więc pracuje we własnym klonie, nigdy w tym, w którym edytujesz ręcznie.

```
~/factory/<projekt>/hub.git    gołe repo, wspólny zdalny torów
~/factory/<projekt>/lane1      klon, w którym pracuje konduktor
~/code/<projekt>               Twój klon z dodanym zdalnym hub
```

## Instalacja w projekcie

```bash
git clone https://github.com/adiyy2001/ricing-export.git ~/ricing-export
cd ~/code/<projekt>
cp -rn ~/ricing-export/factory/kit/. .
node --test factory/*.test.mjs
```

`cp -rn` nie nadpisuje istniejących plików, więc sprawdź, czy `scripts/gate.sh` i `.claude/agents/` nie kolidują z tym, co projekt już ma. Potem dopasuj cztery rzeczy:

1. `factory/config.mjs`: pliki chronione, pliki zależności, wzorzec kodu produkcyjnego i testów, korzenie skanowane przez strażnika stylu, ścieżki niezmienne (migracje), nazwy ról.
2. `scripts/gate.sh`: kroki `install`, `lint`, `types`, `unit`, `build` są dla projektu na pnpm. Podmień polecenia na te z projektu i dodaj własne (e2e, Lighthouse, kontrakt API). Kroki `style`, `tests-guard` i `factory-unit` zostają.
3. `waves/rulebook.md`: cel, pierwszeństwo źródeł, reguły kodu, szybkie polecenia dla sesji.
4. `waves/<tor>/queue.json`: prawdziwe pozycje. `waves/example/` usuń. Pola opisuje `waves/README.md`.

Strażnik stylu odrzuca komentarze i półpauzy w skanowanych korzeniach. Jeśli projekt ma inne zasady, wyjmij krok `style` z bramki.

## Próba bramki

Zanim ruszy pierwszy tor, bramka musi przejść na czystym repo (`GATE OK`) i paść na każdym celowo zepsutym wariancie: błąd typu, padający test, test z `.skip`, komentarz w kodzie. Napisz dla projektu skrypt, który robi te warianty w kopii repo i sprawdza, że bramka pada na właściwym kroku. Bramka, która nie umie paść, niczego nie pilnuje.

## Zdalny hub i klon konduktora

```bash
mkdir -p ~/factory/<projekt>
git init --bare ~/factory/<projekt>/hub.git
cd ~/code/<projekt>
git remote add hub ~/factory/<projekt>/hub.git
git push hub HEAD:refs/heads/build/main
git clone ~/factory/<projekt>/hub.git ~/factory/<projekt>/lane1 --origin hub --branch build/main
```

Zestaw i kolejki muszą być w commicie na `build/main`, zanim powstanie klon. Gotową pracę zabierasz u siebie przez `git fetch hub` i scalenie `hub/build/main`.

## Migawka zużycia

Konduktor czyta `~/.local/share/command-center/plan-limits.json` (zmienna `FACTORY_USAGE_FILE`). Zapisuje go `claude/statusline.sh` z tego repo, o ile katalog istnieje:

```bash
mkdir -p ~/.local/share/command-center
```

Migawka odświeża się tylko wtedy, gdy otwarta jest jakaś interaktywna sesja Claude Code. Starsza niż godzina zatrzymuje fabrykę (z `--loop` czeka i sprawdza co 5 minut). Próg zmienia `FACTORY_USAGE_MAX_AGE_SECONDS`, limit `FACTORY_USAGE_LIMIT`.

## Uruchamianie

```bash
cd ~/factory/<projekt>/lane1
node factory/run.mjs --queue waves/<tor>/queue.json --status
setsid nohup factory/lane-start.sh <tor> >/dev/null 2>&1 &
factory/status.sh 120 ~/factory/<projekt>/lane1
```

`lane-start.sh` trzyma blokadę (jeden konduktor na klon), pisze log do `~/.local/share/factory/lane1/conductor-<tor>.log` i zapis sesji każdej pozycji do `<id>.jsonl` obok. Drugi tor równolegle to drugi klon (`lane2`). Ciężkie bramki obu torów szereguje wspólna blokada `FACTORY_HEAVY_LOCK`. Zatrzymanie: `pgrep -af "node factory/run.mjs"` i `kill <PID>`, bez zabijania po wzorcu nazwy.

Na próbę bez huba: `node factory/run.mjs --queue waves/example/queue.json --no-remote` w kopii repo wykona jedną pozycję i skończy.

## Obsługa na co dzień

- `factory/status.sh`: konduktory, ostatnia linia logu, stan kolejek, nowe blokady, zużycie.
- Nowa blokada: przeczytaj `waves/<tor>/blocked/<id>.md`, usuń przyczynę (decyzja, poprawka zakresu w `queue.json`, naprawa bramki), usuń plik `blocked`, zacommituj i wypchnij na `build/main`. Konduktor weźmie pozycję przy następnym obrocie.
- Decyzja właściciela: dodaj `waves/<tor>/done/<id>.md` z rozstrzygnięciem.
- Zmiany w `factory/`, bramce i regułach robi człowiek albo sesja nadzorowana, nigdy pozycja kolejki.

## Zmienne środowiska

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `FACTORY_CLAUDE` | `claude` | Binarka Claude Code |
| `FACTORY_GATE_CMD` | `scripts/gate.sh` | Polecenie bramki |
| `FACTORY_USAGE_FILE` | `~/.local/share/command-center/plan-limits.json` | Migawka zużycia |
| `FACTORY_USAGE_LIMIT` | `95` | Próg zużycia tygodniowego w procentach |
| `FACTORY_USAGE_MAX_AGE_SECONDS` | `3600` | Najstarsza dopuszczalna migawka |
| `FACTORY_PHASE_FILE` | brak | Plik stanu faz dla pola `requires` |
| `FACTORY_POLL_SECONDS` | `300` | Odstęp sprawdzania w trybie `--loop` |
| `FACTORY_LOG_DIR` | `.factory-logs` | Logi konduktora i sesji |
| `FACTORY_HEAVY_LOCK` | brak | Plik blokady szeregującej bramki |

Opcje `run.mjs`: `--queue`, `--loop`, `--status`, `--no-remote`, `--remote` (domyślnie `hub`), `--trunk` (domyślnie `build/main`).

## Czego tu nie ma

Zestaw to sam konduktor. Na CachyOS dochodzą rzeczy związane z tamtą maszyną i kontami: tory na serwerze domowym, przełączanie kont subskrypcji, watchdog i autopilot Command Center, powiadomienia na telefon. Na nowej maszynie dobuduj je dopiero wtedy, gdy będą potrzebne.

## Sprawdzone

Stan z 23.11.2026, Node 24.13: `node --test factory/*.test.mjs` daje 33 z 33. Próba na prawdziwej sesji w pustym repo: pozycja `E1` z `waves/example` zrobiona, bramka `style`, `tests-guard`, `factory-unit` przeszła, commit `feat(example): greeting module with a test`, potem recenzja `E3` bez blokerów.
