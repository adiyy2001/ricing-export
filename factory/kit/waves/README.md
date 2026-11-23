# Fale budowy

Tor to katalog `waves/<tor>/` z kolejką `queue.json`. Konduktor `factory/run.mjs` bierze z niej po jednej pozycji, a sędzią jest `scripts/gate.sh`.

## Przepływ

1. Konduktor bierze pierwszą gotową pozycję i sprawdza limit subskrypcji (migawka zużycia poniżej 95%) oraz wymaganie fazy.
2. Świeża sesja `claude -p` z rolą `wave-implementer` pracuje w plikach pozycji i nie commituje.
3. Konduktor sprawdza zakres plików, zależności, nowe przypadki testowe, całą bramkę i `checks`. Porażka wraca do tej samej sesji, najwyżej 3 razy.
4. Sukces: commit z `waves/<tor>/done/<id>.md`, scalenie z trunkiem `build/main`, ponowna bramka, jeśli trunk się przesunął, push do zdalnego `hub`.
5. Porażka albo `BLOCKED:`: `waves/<tor>/blocked/<id>.md`, kolejka idzie dalej tym, co od pozycji nie zależy.

Pozycje `owner` czekają na decyzję właściciela, `manual` na pracę poza sesją. Zamyka je ręcznie dodany plik `done/<id>.md` z rozstrzygnięciem. Zablokowaną pozycję odblokowuje usunięcie `blocked/<id>.md` po usunięciu przyczyny.

## Pola pozycji

| Pole | Znaczenie |
| --- | --- |
| `id`, `title` | Identyfikator i tytuł, tytuł trafia do commita `feat(<tor>): <title>` |
| `agent` | `wave-implementer`, `owner` albo `manual` |
| `kind` | `review` uruchamia recenzenta zamiast wykonawcy |
| `model`, `effort` | Domyślnie `sonnet` i `medium`, recenzja `opus` i `high` |
| `files` | Globy plików, które pozycja może zmienić |
| `brief`, `stories`, `sources` | Treść zadania i źródła wymagań |
| `dependsOn` | `["A1"]` w tym samym torze, `["core:C1"]` w innym |
| `requires` | Wymaganie fazy, np. `{"audits": "done"}` w pliku z `FACTORY_PHASE_FILE` |
| `checks` | Dodatkowe polecenia po bramce |
| `allowDependencies` | Zgoda na zmianę plików zależności |
| `allowProtected` | Globy plików chronionych, które ta pozycja może zmienić |
| `allowNoTests`, `allowEmpty` | Zgoda na brak nowego testu albo brak zmian |
| `reviewBase` | Commit albo ref, od którego recenzja czyta diff. Bez niego zakres jest pusty, więc w pozycji `review` ustaw go zawsze |
| `commit` | Własny komunikat commita |

## Polecenia

- Stan: `node factory/run.mjs --queue waves/<tor>/queue.json --status`
- Jedna pozycja bez zdalnego repo: `node factory/run.mjs --queue waves/<tor>/queue.json --no-remote`
- Tor w tle: `factory/lane-start.sh <tor>`
- Przegląd: `factory/status.sh 120 <ścieżka klonu>`
- Bramka: `scripts/gate.sh`, jeden krok: `scripts/gate.sh lint`
