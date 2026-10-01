# ALIS

**AutoUpgrade Looks Insanely Simple · by ORA-600**

[Otwórz kreator](https://ora600pl.github.io/alis/) · [Wersja offline](https://ora600pl.github.io/alis/offline.html) · [English](README.md) · [Mapa zastosowań](docs/WORKFLOWS.md)

ALIS przygotowuje konfigurację Oracle AutoUpgrade oraz instrukcję wykonania operacji krok po kroku. Działa w przeglądarce, bez instalacji pakietów i bez backendu. Konfiguracja pozostaje w pamięci karty. Hasła MOS i walletów wpisuje się dopiero w AutoUpgrade na serwerze.

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

Profile: **AutoUpgrade 26.6.260925** i **26.5.260807**. Zbadano rejestry parametrów, wybrane walidatory i przebiegi, wykorzystując dekompilację CFR, dokumentację Oracle oraz przykłady Mike'a Dietricha, Daniela Overby Hansena i Rodrigo Jorge. Szczegóły: [metodologia](docs/PROFILE.md), [mapa przebiegów](docs/WORKFLOWS.md), [wyniki sprawdzeń](docs/VALIDATION.md).

Przeszło **176 testów Node, 7 testów Python, 200 porównań kontraktu z JAR-em i 36 porównań plików z parserami obu wydań**. To nie jest dowód wykonania instalacji ani migracji na Oracle: nie uruchamiano połączeń z bazą, pobierania MOS, instalatora, analyze, fixups ani deploy. Kreator nie zna rzeczywistej topologii, dostępności patchy, uprawnień MOS, zawartości walleta ani warunków odzyskania. Zielony status oznacza przejście zaimplementowanych kontroli statycznych.

Katalog obejmuje deklarowane publiczne parametry; wszystkie kombinacje środowiskowe nie zostały przetestowane. Nieznane opcje są zachowywane z ostrzeżeniem. Zduplikowane, błędne i jawnie niewspierane wpisy blokują eksport `.cfg`.

## Rozwój

Budowanie używa wyłącznie standardowej biblioteki Python 3; testy JavaScript korzystają z Node bez dodatkowych pakietów. Komendy deweloperskie i aktualizację profili opisuje [README](README.md#develop-and-maintain). W repozytorium nie ma binariów Oracle ani zdekompilowanego kodu Oracle.

Niezależne narzędzie społecznościowe, nie produkt Oracle. Licencja MIT obejmuje własny kod i dokumentację ALIS.

## AutoUpgrade 26.6 i wybór wersji

W kroku Plan lub na pasku bocznym wybierz **26.6.260925** albo **26.5.260807**. Wybrana wersja steruje parametrami, składnią patch=, walidacją i runbookiem. Zapisane projekty zachowują swój profil, a zmiana wersji zachowuje ustawienia i sprawdza ich zgodność.

26.6 dodaje pobieranie CPAT, DBSAT, narzędzi/pakietów Exadata, Enterprise Managera i obrazów GI, CSPU dla 21c, czas oczekiwania przy starcie RAC oraz instrukcje SEHA/RAC One Node, PATH_PREFIX i wznowienia zadania. W konfiguracji upgrade usuwa target_edition. [Zmiany, dowody i odtwarzanie testów](docs/AUTOUPGRADE-26.6.md).

Walidacja: 176 testów Node, 7 testów Python, 200 porównań kontraktu z JAR-em i 36 odczytów parsera obu wydań. Nie wykonywano operacji na bazie ani pobierania patchy z MOS.

## Zależności opcji

Kreator wyszarza opcje niedostępne w wybranym przebiegu, wydaniu, platformie lub kombinacji patchy i wyjaśnia powód. Importowane ustawienia pozostają widoczne oraz możliwe do usunięcia; sprzeczności blokują eksport. [Tabela zależności, kolejność Gold Image i diagnostyka PATCH101](docs/DEPENDENCIES.md).
