# Zasady fali budowy

Szablon. Wypełnij dla projektu, zanim ruszy pierwszy tor. Sesja czyta ten plik jako pierwszy i ma on pierwszeństwo przed jej własnym gustem.

## Cel

Co fala ma zbudować i czego nie wolno jej ruszać (publikacja, płatne konta, dane produkcyjne).

## Pierwszeństwo źródeł

1. Decyzje właściciela (plik z decyzjami).
2. ADR albo opis architektury.
3. Wymagania: historie użytkownika, model danych.

Sprawa, której te źródła nie rozstrzygają albo którą zostawiają właścicielowi, to `BLOCKED:`. Sesja nie wymyśla ceny, kwoty, tekstu prawnego ani mechanizmu, którego dokumenty nie opisują.

## Sędzia

`scripts/gate.sh` i jego kroki. Bramka przechodzi na czystym repo i pada na każdym celowo zepsutym wariancie (próba bramki), zanim ruszy pierwszy tor.

## Reguły kodu

- Kod bez komentarzy, także JSDoc, i bez półpauz i pauz. Zamiast komentarza lepsza nazwa.
- Granice modułów i właściciele danych: tu wpisz mapę projektu.
- Istniejącej migracji się nie zmienia, dochodzą tylko nowe pliki.

## Testy

Pozycja, która zmienia kod produkcyjny, dodaje przypadek testowy. Testów się nie osłabia: bez usuwania przypadków, `.skip`, `.only`, `@Disabled`, luźniejszych asercji i podnoszenia budżetów. Test ma móc paść: pusta asercja i atrapa testująca samą siebie to błąd.

## Praca w sesji

- Nie commituj, nie pushuj, nie używaj `docker` ani `ssh`. Lokalnie tylko szybkie sprawdzenia: tu wpisz polecenia projektu. Całość odpala konduktor.
- Bez równoległych buildów i procesów w tle.
- Zależności tylko w pozycji z `allowDependencies`, wersje przypięte.
- Bez sekretów i danych osobowych w repo. Zewnętrzne usługi w testach przez atrapy.

## Kategorie błędów i co robić

| Błąd | Co robić |
| --- | --- |
| Bramka pada na Twoim kodzie | Popraw kod, nie próg |
| Bramka pada poza Twoim zakresem | `BLOCKED:` z krokiem i ogonem logu |
| Brakujący plik poza zakresem pozycji | `BLOCKED:` z nazwą pliku |
| Dokumenty sprzeczne | `BLOCKED:` z dwoma cytatami, bez wyboru |
| Sprawa właściciela | `BLOCKED:` z nazwą decyzji |
