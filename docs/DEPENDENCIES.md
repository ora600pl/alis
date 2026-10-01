# Zależności opcji i diagnoza Gold Image

Sprawdzenie z 1 października 2026. Profile 26.5.260807 i 26.6.260925. Formularz sprawdza proponowany wybór tymi samymi regułami, które kontrolują eksport. Ustawienia globalne są sprawdzane dla wszystkich wpisów, z uwzględnieniem lokalnego nadpisania i deklarowanych wartości domyślnych.

## Gold Image: poprawna kolejność

`gold_image=YES` wybiera obraz wejściowy Oracle. `create_gold_image=YES` pakuje docelowy home po jego instalacji. Te opcje mogą występować razem; brak istniejącego home'a na początku `create_home` nie jest sprzecznością.

W rzeczywistym JAR-ze 26.6:

- `PatchCreateNewHome.getDefinition()` dodaje `getInstallStages()`, następnie `ROOTSH`, a dopiero potem opcjonalne `CREATE_GOLD_IMAGE`.
- `PatchJobCreator.getStandardInstallStages()` zawiera `INSTALL`, opcjonalne `ROOH`, `OH_PATCHING` dla odpowiedniej topologii i `OPTIONS`. Windows RAC ma odrębną kolejność instalacji, ale pakowanie pozostaje po całej tej grupie etapów.
- `CreateGoldImage.userCreatedGoldImage()` pobiera `target_home` i zapisuje wynik procesu w `goldimage/create_user_gold_image.log`.
- `PATCH101` jest rzucany, gdy wynik `runInstaller -createGoldImage -destinationLocation ... -silent` nie jest pomyślny. Komunikat o „source ORACLE_HOME” w wyjątku nie zmienia tego, że ta akcja używa docelowego home'a.

Potwierdzono to przez CFR i niezależny odczyt bytecode `javap -c -p` z JAR-a o SHA-256 zapisanym w profilu. To dowód kolejności i znaczenia błędu, nie wykonania instalatora na Oracle.

Dla zgłoszonego zadania należy przeczytać:

```sh
sed -n '1,240p' /home/oracle/oinstall/autoupgrade/logs/create_home_1/100/goldimage/create_user_gold_image.log
```

Sam stos `PATCH101` nie rozstrzyga, czy przyczyną były uprawnienia, miejsce, stan instalacji czy inny błąd OUI. Nie należy przypisywać konkretnej przyczyny bez wyjścia instalatora.

Dokumentacja Oracle potwierdza pakowanie po utworzeniu docelowego home'a: [create_gold_image i gold_image](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/patch-parameters-autoupgrade-config-file.html).

## Reguły widoczne w formularzu

| Kontekst | Zależność i zachowanie |
| --- | --- |
| Lokalny `PATCH=GOLDIMAGE:plik.zip` | Dodatkowe aliasy, numery patchy i Oracle-supplied image controls są wyszarzone. |
| Lokalny ZIP i tworzenie kolejnego obrazu | ALIS wymaga osobnego projektu do budowania obrazu. Jest to zasada kreatora: JAR może pominąć redundantne pakowanie niezmienionego lokalnego obrazu. Nie jest to twierdzenie, że Oracle zawsze odrzuca tę kombinację. |
| `download`, `analyze`, `fixups` | Pole pakowania jest nieaktywne: te przebiegi nie wykonują końcowego `CREATE_GOLD_IMAGE`. Importowane ustawienie może pozostać w pliku używanym później do instalacji. |
| `gold_image=NO`, lokalny ZIP lub same narzędzia | Poziom bezpieczeństwa obrazu jest nieaktywny. Dla samych narzędzi nieaktywne są również ustawienia obrazów Oracle. |
| Narzędzia/media dostępne tylko do pobrania | Presety i dodatki wykluczone z `create_home`/operacji bazy są wyszarzone zgodnie z wybranym profilem. |
| GI, OEM, duplikaty | W 26.6 GI dopuszcza MRP, OPATCH i numery; OEM jest samodzielnym wyborem. Już wybrany alias nie może być dodany drugi raz. |
| Wydanie, pin RU i platforma | OJVM, MRP, CSPU, DPBP, GI, RECOMMENDED oraz wymagania Oracle-supplied images korzystają ze sprawdzonych reguł eksportu właściwego profilu. |
| Wersja 21 | W 26.6 Linux CSPU jest dostępne; DPBP i MRP są odrzucone. W 26.5 obowiązuje wcześniejszy zestaw reguł. |
| Przypinanie wersji | Wymaga wybranego RU, RECOMMENDED lub GI. Numery patchy nie mogą być dodawane do wykluczających je obrazów/OEM. |
| RAC / Windows / single instance | REQUIRED/FORCE nie są dostępne dla Windows ani zadeklarowanej pojedynczej instancji. |
| Physical standby | Niedopuszczalne tryby pracy bazy są wyszarzone; pobieranie i przygotowanie oprogramowania pozostają odrębnymi przebiegami. |
| Software-only | Parametry GRP, rolling patching i drain nie są dostępne w katalogu ustawień zaawansowanych. |
| `parallel_stats_degree` | Wymaga `dictionary_stats_before=YES`, również po dziedziczeniu. |
| Podnoszenie COMPATIBLE | Nie można wybrać `drop_grp_after_upgrade=NO`. Ograniczenia wydań i zgodności nadal kontroluje eksport. |
| Istniejący home przy upgrade | Media instalacyjne wymagają `create_oracle_home=YES`. |
| Zwykły upgrade / PDB in place | Parametry przenoszenia PDB są nieaktywne do wyboru scenariusza migracji/klonowania. |
| Scope / profil | Katalog blokuje niedostępne parametry i niewłaściwy global/local scope. |
| `folder` / `download_folder` | Gdy jedna nazwa jest ustawiona, druga jest nieaktywna. Różne importowane wartości blokują eksport. |
| Wiele wpisów | Docelowy home nie może być jednocześnie źródłem ani celem innego wpisu patchingu poza download. Reguła pochodzi z `UniqueOracleHomeValidator`; ścieżek z nierozwiązanymi placeholderami nie uznajemy za dowód kolizji. |

Po zmianie wartości i kontekstu blokady są przeliczane bez utraty fokusu. Powód jest dostępny przy nieaktywnym polu, w tytule opcji/przycisku i w rozwijanym „Why are some choices unavailable?”. Zmiana scenariusza/profilu zachowuje dane i pokazuje błędy do naprawienia zamiast kasować je automatycznie.

Importowany sprzeczny plik zachowuje wartości. Przycisk „Remove explicit setting” działa również przy wyszarzonym polu; dopiero poprawna konfiguracja odblokowuje eksport. Ręcznie wpisany patch expression nadal podlega pełnej kontroli eksportu. Przyciski i katalog ustawień zaawansowanych nie obchodzą tych kontroli.

## Runbook i granice sprawdzenia

Gdy projekt deploy ma tworzyć obraz wynikowy, osobne przygotowanie home'a używa artefaktu `*.home.cfg` z `create_gold_image=NO`. Oryginalna konfiguracja deploy zachowuje żądanie pakowania. Zapobiega to dwukrotnemu tworzeniu tego samego pliku ZIP, zwłaszcza przy stałej nazwie. Wskazówka o zachowaniu obrazu pojawia się po wykonaniu operacji.

200 testów Node obejmuje 24 nowe regresje zależności, import/naprawę, obydwa profile, zgłoszoną poprawną konfigurację wejście/wyjście i oddzielny artefakt przygotowania home'a. 9 testów Python sprawdza build oraz wersjonowanie i CSP pliku offline. Formularz online i offline sprawdzono również w przeglądarce.

Reguły pochodzą z dotychczasowych inspekcji walidatorów i konsumentów opisanych w [PROFILE.md](PROFILE.md) oraz bieżącej analizy kolejności etapów, `CreateGoldImage` i `UniqueOracleHomeValidator`. Nie jest to kompletna symulacja Oracle: ALIS nie sprawdza plików serwera, OUI, uprawnień, miejsca, inwentarza, baz ani usług MOS/ARU. To ograniczenie obejmuje także zgłoszony `PATCH101`.
