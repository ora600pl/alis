# ALIS + Ansible — pierwsze uruchomienie

Ansible uruchamiasz na swoim Macu lub komputerze Linux. Ten komputer to **kontroler**: przez SSH wysyła pliki i polecenia do serwera Oracle. Na serwerze potrzebujesz Pythona 3.9–3.14 i konta SSH; samego Ansible instalujesz tylko na kontrolerze. Playbook to plik YAML z kolejnością zadań, a inventory to lista serwerów. Ten pakiet korzysta wyłącznie z modułów wbudowanych w `ansible-core`.

## 1. Zainstaluj Ansible na kontrolerze

Potrzebujesz Python 3.12–3.14 na kontrolerze. W Terminalu:

```sh
python3 -m venv ~/.venvs/alis-ansible
source ~/.venvs/alis-ansible/bin/activate
python3 -m pip install 'ansible-core>=2.21,<2.22'
ansible-playbook --version
```

Przy kolejnym otwarciu Terminala wystarczy ponownie wykonać polecenie `source`. Pakiet sprawdzono z ansible-core 2.21.4 oraz 2.19.13. Serwer ze starszym Pythonem 3.8 wymaga tej starszej linii Ansible, ze sprawdzeniem aktualnego okresu wsparcia w dokumentacji producenta.

## 2. Najpierw wykonaj test lokalny, bez Oracle

Rozpakuj ZIP, przejdź do katalogu `alis-ansible` i uruchom:

```sh
ansible-playbook test-local.yml --syntax-check
ansible-playbook test-local.yml
```

Test używa `localhost`, nowego katalogu tymczasowego i sztucznych narzędzi Java/SQLPlus/OPatch. Korzysta z tych samych zadań i runnera co rzeczywiste playbooki, ale z własną konfiguracją symulacji. Nie łączy się z serwerem wpisanym w `inventory.yml`. Wykonuje przygotowanie → analyze → deploy → verify → powtórny deploy. Ostatnie wdrożenie zostaje pominięte, bo cykl jest już zakończony.

Oczekiwany wynik: w `PLAY RECAP` wartości `failed=0` i `unreachable=0`. `changed` oznacza wykonane zadania; jego wartość większa od zera jest normalna. Na końcu zobaczysz ścieżkę do plików JSON i logów symulacji. Kopie wyników trafiają do `artifacts/localhost/` w rozpakowanym pakiecie.

Możesz zobaczyć, jak wygląda wykrycie błędu:

```sh
ansible-playbook test-local.yml -e alis_test_failure=status
ansible-playbook test-local.yml -e alis_test_failure=sqlpatch
```

W tych dwóch testach `failed=1` jest oczekiwane: sztuczna Java kończy się kodem zero, ale raport etapu albo SQL patch registry zawiera błąd. Każde uruchomienie tworzy nowy katalog. Aby go usunąć, użyj dokładnej ścieżki wypisanej przez test; nie usuwaj katalogów z prawdziwym stanem AutoUpgrade.

## 3. Sprawdź pakiet dla swojego serwera

```sh
ansible-inventory --graph
ansible-playbook prepare.yml --syntax-check
ansible-playbook analyze.yml --syntax-check
ansible-playbook deploy.yml --syntax-check
ansible-playbook verify.yml --syntax-check
```

Te polecenia sprawdzają strukturę plików, bez uruchamiania Oracle. Host i konto SSH są w `inventory.yml`, a właściciel Oracle, katalog roboczy i timeout w `host_vars/oracle_db.yml`. `files/plan.json` zawiera wybrany build i SHA-256 JAR-a, SID, ścieżki i oczekiwany hash konfiguracji. Oryginalna konfiguracja kreatora jest w `files/autoupgrade.cfg`; dodatkowa instrukcja operacyjna w `alis-runbook.md`.

Najpierw połącz się zwykłym SSH z hostem podanym w inventory, sprawdź jego klucz i dostęp konta. Następnie:

```sh
ansible oracle_patch -m ansible.builtin.ping
```

Moduł `ping` sprawdza SSH i możliwość uruchomienia Pythona; nie jest pingiem ICMP. Jeżeli konto SSH różni się od właściciela Oracle, playbook używa `sudo` do zmiany użytkownika. W takim przypadku potrzebujesz odpowiednich uprawnień; jeżeli sudo wymaga hasła, dodaj `-K` do poleceń `ansible-playbook`. Hasło SSH można podać przez `--ask-pass`; wygodniej używać istniejącego klucza SSH.

## 4. Przygotuj środowisko na bazie laboratoryjnej

Na serwerze muszą istnieć: właściciel oprogramowania i grupy, wymagania instalatora, Java obsługiwana przez wybrany JAR oraz katalog z mediami. Umieść JAR pod ścieżką `jar` z `files/plan.json` — nie jest dołączony do ZIP-a. Jeśli w ALIS wpisałeś samą nazwę `autoupgrade.jar`, plik musi znaleźć się w wybranym katalogu roboczym. Runner sprawdzi jego build i SHA-256.

Dla `download=YES` wcześniej przygotuj AutoUpgrade auto-login keystore poleceniem `-load_password` z runbooka, interaktywnie na serwerze jako właściciel Oracle. Dla `download=NO` przygotuj kompletny katalog mediów wraz z metadanymi. Wallet TDE ma odrębne wymagania. Nie wpisuj haseł do YAML ani JSON.

Użyj osobnego katalogu roboczego i osobnego globalnego katalogu logów dla każdego cyklu patchowania. W tych katalogach zachowywany jest stan potrzebny do wznowienia. ALIS nie uruchamia skryptów roota; wymagane przez instalator skrypty lub mechanizm ich wykonania przygotuj zgodnie z runbookiem i rzeczywistymi komunikatami AutoUpgrade. Okno prac, backup i test aplikacji są częścią planu administratora.

## 5. Uruchom kolejne etapy na serwerze laboratoryjnym

```sh
ansible-playbook prepare.yml
ansible-playbook analyze.yml
```

`prepare` kopiuje pliki i sprawdza JAR, tożsamość bazy, topologię, media oraz obecność auto-login walleta dla pobierania online. `analyze` uruchamia rzeczywiste kontrole AutoUpgrade. Przeczytaj pobrane logi i raporty w `artifacts/oracle_db/` oraz raporty AutoUpgrade na serwerze. Dopiero po pomyślnej analizie uruchom:

```sh
ansible-playbook deploy.yml
ansible-playbook verify.yml
```

`deploy` wykonuje rzeczywiste patchowanie i wymaga wcześniejszej udanej analizy z tego samego pakietu. Sprawdza świeże `status.json` i `progress.json`, powodzenie wymaganych etapów, aktywny Oracle Home przez `/proc`, inventory target-home i najnowsze wpisy SQL patch registry we wszystkich kontenerach. Zamknięty PDB blokuje pełną weryfikację. `verify` ponawia kontrolę końcową. Jeżeli AutoUpgrade zakończył się poprawnie, a zawiodła tylko weryfikacja (np. zamknięty PDB), po poprawieniu przyczyny uruchom `verify.yml`: runner nie powtarza patchowania. Analiza blokuje wdrożenie przy nieukończonych lub nieudanych kontrolach; przeczytaj raport konkretnej kontroli. Sukces playbooka nie zastępuje testów usług i aplikacji.

Ta wersja obejmuje jedną bazę Linux, pojedynczą instancję, brak Data Guard i patchowanie OUTOFPLACE. Eksport blokuje inne topologie; runner sprawdza też rzeczywistą rolę, `cluster_database`, konfigurację redo i aktywny home. Koordynacja RAC, SEHA, RAC One Node i Data Guard wymaga odrębnego przebiegu. Wykonanie na prawdziwej bazie Oracle nie było częścią testów tego eksportera.

## Przerwanie, timeout i wznowienie

Timeout jest limitem na operację, a po jego przekroczeniu Ansible przerywa proces. Ustaw go odpowiednio do swojego okna i czasu instalacji. Po utracie kontrolera najpierw sprawdź, czy zadanie nadal działa na serwerze; blokada runnera uniemożliwia drugi równoległy start ALIS.

Po diagnozie błędu możesz wznowić ten sam etap:

```sh
ansible-playbook deploy.yml -e alis_resume=true
```

Zachowaj oryginalne pliki, JAR, wallet, logi i stan AutoUpgrade. 26.6 dostaje `-resume`; 26.5 ponawia to samo polecenie ze stanem odzyskiwania. Nie zmieniaj katalogu ani konfiguracji podczas wznawiania i nie używaj `-clear_recovery_data` jako sposobu na zwykły błąd. Zakończony cykl nie wykonuje patchowania ponownie; nowy patch wymaga nowego pakietu i nowych katalogów.

`--check` nie symuluje Oracle: playbooki celowo odrzucają ten tryb. Do nauki służy `test-local.yml`, a do kontroli rzeczywistej bazy `analyze.yml`.

Źródła: [instalacja Ansible](https://docs.ansible.com/projects/ansible/latest/installation_guide/intro_installation.html), [zadania asynchroniczne](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_async.html), [AutoUpgrade CLI](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/autoupgrade-command-line-parameters.html).
