# AUGUR

**AutoUpgrade Workbench · by ORA-600**

[Otwórz kreator](https://ora600pl.github.io/augur/) · [Wersja offline](https://ora600pl.github.io/augur/offline.html) · [English](README.md) · [Mapa zastosowań](docs/WORKFLOWS.md)

AUGUR przygotowuje konfigurację Oracle AutoUpgrade oraz instrukcję wykonania operacji krok po kroku. Działa w przeglądarce, bez instalacji pakietów i bez backendu. Konfiguracja pozostaje w pamięci karty. Hasła MOS i walletów wpisuje się dopiero w AutoUpgrade na serwerze.

## Co można przygotować

- Świeży Oracle Home na pustym serwerze, bez SID i bez `source_home`.
- Nowy home z ustawieniami odziedziczonymi z istniejącej instalacji.
- Pobranie patchy bazy, patchy GI wskazanych numerami i narzędzi, również dla innej platformy.
- Własny Gold Image lub instalację z gotowego lokalnego ZIP-a.
- Upgrade bazy lub wybranych PDB znajdujących się już w docelowym CDB.
- Konwersję non-CDB, unplug/plug oraz klonowanie PDB lub non-CDB: jednorazowe albo z cyklicznym odświeżaniem.
- Patching istniejących baz z ustawieniami i wskazówkami dotyczącymi RAC, Data Guard oraz systemu operacyjnego.

Każda z **12 ścieżek** ma przykład do wczytania i edycji. Wbudowany **Field guide** zawiera poradniki, wyszukiwarkę wszystkich **132 odrębnych nazw parametrów** oraz katalog opcji CLI. Parametry odrzucone lub niezweryfikowane w tym wydaniu są oznaczone.

## Jak używać

1. W **Plan** wybierz cel i tryb wykonania. Możesz wczytać przykład przyciskiem **Load example for this workflow**.
2. Uzupełnij home/bazę, media, mapowania migracji i kontekst środowiska.
3. Przejrzyj ustawienia odzyskiwania oraz opcje dodatkowe.
4. W **Runbook** popraw błędy i przeczytaj uwagi. Pobierz `.cfg` oraz instrukcję Markdown, skopiuj pojedyncze komendy lub użyj widoku do druku/PDF.
5. Dla klonowania pobierz również osobną konfigurację źródła do analyze/fixups. Ścieżka rzeczywistego home'a źródła może różnić się od wpisu używanego na serwerze docelowym.

Przykład świeżej instalacji znajduje się w [angielskim README](README.md#fresh-home-example). Kreator prowadzi przez katalogi robocze, `-load_password`, dialog MOS, pobranie mediów, `create_home` i warunkowe skrypty roota. Jednorazowy klon ma fixupy przed kopiowaniem; klon cykliczny otrzymuje osobny etap końcowego odświeżenia i `proceed -job`.

Wyniki obejmują konfiguracje, komendy POSIX/PowerShell, kroki w konsoli AutoUpgrade, instrukcje ręczne i odsyłacze do źródeł. Narzędzia odzyskiwania są pokazane osobno od zwykłej kolejności wykonania.

**Save project** zapisuje JSON pozwalający wrócić do pracy wraz z kontekstem środowiska. Sama konfiguracja `.cfg` nie przechowuje wybranego trybu ani tych preferencji; przy imporcie kreator je wnioskuje i trzeba je sprawdzić. Import zachowuje komentarze, kolejność i nieznane opcje, a widok **Changes** pokazuje różnice. Strona nie zapisuje projektu w localStorage.

## Na czym opiera się walidacja

Profil: **AutoUpgrade 26.5.260807**, build 2026-08-07. Zbadano rejestry parametrów, wybrane walidatory i przebiegi, wykorzystując dekompilację CFR, dokumentację Oracle oraz przykłady Mike'a Dietricha, Daniela Overby Hansena i Rodrigo Jorge. Szczegóły: [metodologia](docs/PROFILE.md), [mapa przebiegów](docs/WORKFLOWS.md), [wyniki sprawdzeń](docs/VALIDATION.md).

Przeszło **127 testów Node, 7 testów Python oraz 14 porównań wygenerowanych plików z parserem dostarczonego JAR-a**. To nie jest dowód wykonania instalacji ani migracji na Oracle: nie uruchamiano połączeń z bazą, pobierania MOS, instalatora, analyze, fixups ani deploy. Kreator nie zna rzeczywistej topologii, dostępności patchy, uprawnień MOS, zawartości walleta ani warunków odzyskania. Zielony status oznacza przejście zaimplementowanych kontroli statycznych.

Katalog obejmuje deklarowane publiczne parametry; wszystkie kombinacje środowiskowe nie zostały przetestowane. Nieznane opcje są zachowywane z ostrzeżeniem. Zduplikowane, błędne i jawnie niewspierane wpisy blokują eksport `.cfg`.

## Rozwój

Budowanie używa wyłącznie standardowej biblioteki Python 3; testy JavaScript korzystają z Node bez dodatkowych pakietów. Komendy deweloperskie i aktualizację profili opisuje [README](README.md#develop-and-maintain). W repozytorium nie ma binariów Oracle ani zdekompilowanego kodu Oracle.

Niezależne narzędzie społecznościowe, nie produkt Oracle. Licencja MIT obejmuje własny kod i dokumentację AUGUR.
