# AUGUR — kreator konfiguracji AutoUpgrade

[Otwórz kreator](https://ora600pl.github.io/augur/) · [Wersja offline](https://ora600pl.github.io/augur/offline.html) · [English](README.md)

AUGUR prowadzi przez przygotowanie pliku `.cfg` dla Oracle AutoUpgrade. Interfejs jest po angielsku. Obsługuje upgrade, non-CDB → PDB, unplug/plug, refreshable PDB oraz patching, wiele baz, parametry globalne/lokalne i mapowanie PDB.

Wybierz scenariusz, wprowadź dane bazy, sprawdź ustawienia odtwarzania i pobierz konfigurację. Podgląd pliku aktualizuje się na bieżąco. Zakładka Review pokazuje błędy i ostrzeżenia. Polecenia są przygotowane dla powłoki POSIX; strona ich nie wykonuje.

Możesz importować istniejący `.cfg`, obejrzeć różnice oraz zapisać szkic jako JSON. Komentarze, kolejność i nieznane ustawienia importowanego dokumentu są zachowywane. Duplikaty i nieczytelne linie trzeba poprawić w pliku źródłowym i zaimportować ponownie.

Konfiguracja pozostaje w pamięci przeglądarki, bez wysyłania jej na serwer i bez zapisu do localStorage. Zapisz projekt przed zamknięciem strony. Hosting otrzymuje zwykłe żądania pobrania strony; nie należy utożsamiać lokalnego przetwarzania danych z brakiem logów dostępu GitHuba.

Wersję offline pobierz jako `offline.html` i otwórz w przeglądarce. Zawiera kod, style i profile w jednym pliku.

Pierwszy profil dotyczy dokładnie **26.5.260807**. Pomyślna walidacja statyczna nie oznacza, że baza jest gotowa do upgrade. Strona nie sprawdza Oracle Homes, stanu bazy, dostępności patchy ani odtwarzania. Wykonaj `analyze` narzędziem AutoUpgrade na serwerze Oracle. Hasła obsługuje jego keystore, nie plik konfiguracyjny ani JSON projektu.

Kod strony używa HTML/CSS/JavaScript bez bibliotek zewnętrznych. Narzędzia utrzymaniowe używają Pythona 3.9+ i wyłącznie biblioteki standardowej. Testy logiki uruchamia Node.js 24. Instrukcje uruchomienia i struktura projektu są w [README](README.md), a procedura aktualizacji profili w [PROFILE.md](docs/PROFILE.md).
