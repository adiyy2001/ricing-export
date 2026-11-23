# Ricing export: CachyOS (KDE Plasma 6.8) do Ubuntu

Instrukcja dla Claude Code na nowym laptopie z Ubuntu. Cel: odtworzyć wygląd i zachowanie terminala, zsh, VS Code i pulpitu KDE z laptopa CachyOS. Wszystkie pliki źródłowe są w tym archiwum, ścieżki niżej są względne do katalogu archiwum.

Docelowy system: Ubuntu 26.04 LTS. Domyślnie ma GNOME (Wayland), więc pulpit odtwarzaj według sekcji 5b. Sekcja 5 dotyczy tylko sytuacji, w której zainstalowano Kubuntu 26.04 albo `kubuntu-desktop` (Plasma 6). Sprawdź `echo $XDG_CURRENT_DESKTOP`. Sekcje 1 do 4 działają w obu przypadkach.

Zasady przy instalacji:
- Przed nadpisaniem pliku zrób kopię `*.bak-<data>`.
- Ścieżki w configach wskazują `/home/castro`. Zamień na `$HOME` nowego użytkownika (`grep -rl /home/castro .`).
- `sudo` może wymagać, żeby użytkownik sam wpisał polecenie. Podaj je jako `! <polecenie>`.
- Nie przenoś sekretów. W archiwum ich nie ma, `.zshrc` zawiera tylko konfigurację.

## 0. Paleta i fonty (RETRO VECTOR)

Styl: cyberpunk, neon, glitch, odrobina oldschoolu, płynność jak w macOS (traffic lights, zaokrąglone rogi 12 px, mały cień).

| Rola | Kolor |
|---|---|
| tło | `#0A0612` |
| tło 2 / panele | `#140C24` |
| tekst | `#E8F9FF` |
| akcent róż | `#FF2A6D` |
| akcent cyjan | `#05D9E8` |
| akcent żółty | `#F9F002` |
| zielony | `#00FF9F` |
| fiolet | `#E040FB` |
| przygaszony | `#8F86B0` |

Fonty: UI `Inter` 10, monospace `JetBrainsMono Nerd Font` (Ghostty Bold 11), w VS Code `JetBrains Mono` 14 i w terminalu VS Code `GeistMono Nerd Font Mono` 13, zapasowo `CaskaydiaCove NF`. Ozdobne: `Anton`, `Rajdhani`.

```bash
sudo apt install fonts-inter
mkdir -p ~/.local/share/fonts && cd ~/.local/share/fonts
for f in JetBrainsMono GeistMono CascadiaCode; do
  curl -fLO https://github.com/ryanoasis/nerd-fonts/releases/latest/download/$f.zip && unzip -o $f.zip -d $f && rm $f.zip
done
fc-cache -f
```

JetBrains Mono (bez Nerd) i Anton, Rajdhani: z Google Fonts albo `fonts-jetbrains-mono`.

## 1. Narzędzia CLI

Wersje na CachyOS: Ghostty 1.4.0, starship 1.26.0, fastfetch 2.71.0, VS Code 1.144.

```bash
sudo apt install zsh fzf bat eza fd-find ripgrep zoxide btop wl-clipboard git curl unzip
```

- Na Ubuntu `bat` to `batcat`, `fd` to `fdfind`. Dodaj symlinki: `ln -s $(which batcat) ~/.local/bin/bat; ln -s $(which fdfind) ~/.local/bin/fd`.
- Na Ubuntu 26.04 w apt powinny być też `fastfetch` i może `yazi`. Sprawdź `apt policy <pakiet>`, zanim sięgniesz po GitHuba.
- `fzf` z apt na 26.04 powinien już obsługiwać `source <(fzf --zsh)` (wymaga 0.48+). Jeśli `fzf --version` pokaże starszy, zainstaluj z GitHuba (`git clone --depth 1 https://github.com/junegunn/fzf ~/.fzf && ~/.fzf/install --bin`, potem `~/.fzf/bin` w PATH).
- starship: `curl -sS https://starship.rs/install.sh | sh`.
- fastfetch, yazi, lazygit: z PPA albo release'ów GitHuba (apt często ich nie ma).
- Ghostty: pakiet dla Ubuntu z https://ghostty.org/docs/install/binary (społecznościowy `.deb` albo snap).
- `wl-clipboard` jest dla Waylanda. Na X11 zamień w `zsh/cyber.zsh` `wl-paste` na `xclip -o -selection clipboard`.

Configi:

```bash
cp -r cli/eza cli/fastfetch cli/yazi cli/lazygit cli/btop ~/.config/
```

## 2. zsh

Oh My Zsh bez motywu (`ZSH_THEME=""`), prompt robi starship.

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
C=${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins
git clone https://github.com/Aloxaf/fzf-tab $C/fzf-tab
git clone https://github.com/zsh-users/zsh-autosuggestions $C/zsh-autosuggestions
git clone https://github.com/zdharma-continuum/fast-syntax-highlighting $C/fast-syntax-highlighting
git clone https://github.com/MichaelAquilina/zsh-you-should-use $C/you-should-use
git clone https://github.com/zsh-users/zsh-completions $C/zsh-completions
mkdir -p ~/.config/zsh ~/.zsh
cp zsh/.zshrc ~/.zshrc
cp zsh/cyber.zsh ~/.config/zsh/cyber.zsh
cp zsh/devkit.zsh ~/.zsh/devkit.zsh
cp zsh/starship.toml ~/.config/starship.toml
chsh -s $(which zsh)
```

Co jest w środku:
- Pluginy OMZ: git, docker, npm, node, dotnet, sudo, fzf-tab, zsh-autosuggestions, fast-syntax-highlighting, you-should-use, colored-man-pages, copypath, copyfile, web-search, jsontools, encode64, history, common-aliases.
- Aliasy `ls/l/ll/la/lt/ltt` na eza z ikonami, `cat` na bat, `lg` lazygit, `y` yazi ze zmianą katalogu.
- fzf w kolorach neon (ramka `#FF2A6D`, prompt `⚡`), podglądy przez bat i eza tree, fzf-tab z podglądem przy `cd`.
- Funkcje `fe` (otwórz plik), `frg` (live ripgrep), `fgl` (git log), `fkill`, `fport`, `memcap`.
- `Ctrl+Space` otwiera `cyber-deck` (menu skrótów), `Ctrl+V` wkleja ze schowka Wayland, fastfetch raz na sesję.
- Starship: segment powerline w różu z katalogiem, ciemny segment z gitem w cyjanie i żółci, prawa strona: czas, status, node, python, docker. Znacznik `worktree` dla git worktree.

Do dostosowania na Ubuntu:
- Funkcja `claude()` w `.zshrc` zależy od `~/.claude/sandbox.json` i katalogów `~/claude-start`. Jeśli ich nie ma, sama przejdzie na zwykłe `claude`, ale komunikat na stderr będzie przy każdym starcie. Usuń funkcję albo skonfiguruj sandbox.
- Ścieżki nvm i bun zostaw, zainstaluj nvm (`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash`, potem `nvm install 24`).
- `memcap` używa `systemd-run --user`, działa na Ubuntu.

## 3. Terminal Ghostty

```bash
mkdir -p ~/.config/ghostty && cp -r ghostty/config ghostty/shaders ~/.config/ghostty/
```

JetBrainsMono Nerd Font Bold 11, tło `#0a0612` z przezroczystością 0.93 i blurem 30, kursor blok `#ff2a6d`, pełna paleta 16 kolorów w configu, shader `cyber-glitch.glsl` (animowany glitch), quick terminal u góry 46%, skróty splitów `ctrl+shift+d/s`, `alt+h/j/k/l`, `alt+z`. Blur działa tylko na KDE, na GNOME go nie ma. Jeśli shader źle chodzi na integrze, zakomentuj `custom-shader`.

## 4. VS Code

```bash
U=~/.config/Code/User; mkdir -p $U
cp vscode/settings.json vscode/keybindings.json $U/
cp -r vscode/snippets $U/ 2>/dev/null
mkdir -p ~/vscode-custom && cp vscode/cookbook.css ~/vscode-custom/
grep -v '^adrian\.' vscode/extensions.txt | xargs -L1 code --install-extension
cp -r vscode/extensions-local/* ~/.vscode/extensions/
```

- Motyw `Darcula` (rokoroku.vscode-theme-darcula), ikony `vscode-jetbrains-icon-theme-2023-dark` (chadalen), własne kolory `workbench.colorCustomizations` (sidebar `#292929`, panel i terminal `#1d1d20`, fokus `#4a9fd8`, nawiasy w kolorach Darculi). Wygląd ma przypominać JetBrains, a nie neon z pulpitu.
- Custom UI Style (subframe7536.custom-ui-style) wczytuje `~/vscode-custom/cookbook.css`. W settings ścieżka to `file:///home/castro/vscode-custom/cookbook.css`, zamień na nowy home.
- Rozszerzenia `adrian.*` są lokalne (nie z Marketplace), kopiowane katalogami.
- AI w VS Code wyłączone (Copilot, chat), Claude Code w panelu.
- `sqltools.connections` wskazuje lokalne bazy, które na nowym laptopie nie istnieją. Usuń te wpisy.

## 5b. Pulpit GNOME (domyślne Ubuntu 26.04)

Klassy, motyw Plasma i CyberNeon.colors nie działają na GNOME. Ten sam efekt (chrome jak w macOS plus neon) da się uzyskać tak:

```bash
sudo apt install gnome-tweaks gnome-shell-extension-manager gnome-shell-extensions
git clone --depth 1 https://github.com/vinceliuice/WhiteSur-gtk-theme && cd WhiteSur-gtk-theme && ./install.sh -c dark -l && ./tweaks.sh -F && cd ..
git clone --depth 1 https://github.com/vinceliuice/WhiteSur-icon-theme && cd WhiteSur-icon-theme && ./install.sh -a -b && cd ..
```

- Kursor macOS: https://github.com/ful1e5/apple_cursor, rozpakuj do `~/.local/share/icons`.
- Ustawienia:
  ```bash
  gsettings set org.gnome.desktop.interface color-scheme prefer-dark
  gsettings set org.gnome.desktop.interface gtk-theme WhiteSur-Dark
  gsettings set org.gnome.desktop.interface icon-theme WhiteSur-dark
  gsettings set org.gnome.desktop.interface cursor-theme macOS
  gsettings set org.gnome.desktop.interface cursor-size 24
  gsettings set org.gnome.desktop.interface font-name 'Inter 10'
  gsettings set org.gnome.desktop.interface monospace-font-name 'JetBrainsMono Nerd Font 10'
  gsettings set org.gnome.desktop.interface accent-color pink
  gsettings set org.gnome.desktop.wm.preferences button-layout 'close,minimize,maximize:'
  gsettings set org.gnome.desktop.interface enable-animations true
  ```
  Przyciski po lewej to odpowiednik traffic lights z Klassy. Akcent `pink` jest najbliżej `#FF2A6D`.
- Rozszerzenia (przez Extension Manager): User Themes (motyw powłoki WhiteSur-Dark), Dash to Dock (dok na dole, autohide, kropki aktywnych aplikacji; wbudowany Ubuntu Dock wyłącz), Blur my Shell (blur panelu i doku, blur aplikacji dla Ghostty, żeby działało `background-blur`), Rounded Window Corners Reborn (rogi 12 px, mały cień), Burn My Windows (opcjonalnie efekt glitch przy otwieraniu, jednak bez przesady, bo właściciel chce płynności jak w macOS, a nie fajerwerków).
- Tapety z `kde/wallpapers/` ustaw przez `gsettings set org.gnome.desktop.background picture-uri-dark file://$HOME/.local/share/wallpapers/cyber/center.png`.
- Ghostty na GNOME: `window-decoration = server` zamień na `auto` (GNOME nie daje dekoracji po stronie serwera).
- Skrót Ctrl+Space jest w GNOME zajęty przez przełączanie źródła wprowadzania. Zwolnij go w Ustawienia, Klawiatura, inaczej `cyber-deck` w zsh nie zadziała.
- Po zmianach zrób zrzut ekranu (`gnome-screenshot` albo PrtSc) i pokaż właścicielowi.

## 5. Pulpit KDE Plasma 6 (tylko Kubuntu 26.04 albo kubuntu-desktop)

Na CachyOS: Plasma 6.8.3, Wayland. Kubuntu 26.04 ma Plasma 6, ale starszą, więc Klassy trzeba zbudować ze źródeł pod tę wersję. Sprawdź `plasmashell --version`.

Elementy:
- Schemat kolorów `CyberNeon` (`kde/color-schemes/CyberNeon.colors` do `~/.local/share/color-schemes/`).
- Motyw pulpitu Plasma `cyber-mac` (`kde/desktoptheme/cyber-mac` do `~/.local/share/plasma/desktoptheme/`), z kropką pod aktywną aplikacją w doku.
- Ikony `WhiteSur-dark` (https://github.com/vinceliuice/WhiteSur-icon-theme, `./install.sh -a -b`), dodatkowo własne `CyberIcons` (`kde/icons/CyberIcons` do `~/.local/share/icons/`).
- Kursor `macOS` (https://github.com/ful1e5/apple_cursor), rozmiar 24.
- Styl widżetów Breeze, GTK Breeze dark z tymi samymi ikonami, kursorem i fontem Inter (`kde/gtk3-settings.ini`).
- Dekoracje okien Klassy (https://github.com/paulmcauley/klassy, budować ze źródeł pod wersję Plasma). Config `kde/klassy/klassyrc`: przyciski jako kropki traffic lights po lewej (`ButtonsOnLeft=XIA`, prawa strona pusta), rogi 12 px, bez obrysu, `BorderSize=None`.
- Cień okien mały: Breeze shadow `ShadowMedium`, siła 110, kolor czarny (`kde/breezerc`). Właściciel nie chce dużej poświaty na krawędziach.
- Animacje: `AnimationDurationFactor=1`. Efekty KWin włączone: scale, magiclamp, translucency, slide. Wyłączone: glide, fade, fadedesktop, fallapart, squash.
- Panel: dok z `icontasks` na dole w stylu macOS, górny pasek z zegarem, tray, pogoda. Panel Colorizer (luisbocanegra.panel.colorizer) koloruje panele. Kando (menu kołowe) opcjonalnie.
- Tapety: `kde/wallpapers/center.png`, `left.png`, `right.png` (generator `src/vector.html`) do `~/.local/share/wallpapers/cyber/`.
- Pliki `kde/kdeglobals`, `kde/kwinrc`, `kde/plasmarc`, `kde/kcminputrc` są pełnymi kopiami z CachyOS. Nie nadpisuj ich w całości, przenieś tylko klucze: `[General] ColorScheme, font, fixed, menuFont, toolBarFont`, `[Icons] Theme`, `[KDE] widgetStyle, AnimationDurationFactor`, `[org.kde.kdecoration2]`, `[Plugins]`, `[Theme] name`, `[Mouse] cursorTheme`. Ustawiaj przez `kwriteconfig6`, potem `qdbus6 org.kde.KWin /KWin reconfigure`.
- Po edycji klassyrc samo `reconfigure` nie odświeża kolorów przycisków. Wyślij `gdbus emit --session --object-path /KlassyDecoration --signal org.kde.Klassy.Style.updateDecorationColorCache` i potem `gdbus emit --session --object-path /KWin --signal org.kde.KWin.reloadConfig`.
- Skróty globalne zapisuj na żywo przez kglobalaccel (gdbus). `kwriteconfig` gubi je przy wylogowaniu.
- Nie wylogowuj użytkownika bez pytania.

## 6. Skrypty

`bin/cyber-deck` (menu Ctrl+Space: terminal, projekt, Claude, lazygit, yazi, btop, Brave, zrzut, pipeta) i `bin/cyber-keys` (ściągawka skrótów) do `~/.local/bin/`, `chmod +x`. Wpisy CC, SERWER i ścieżki do node są specyficzne dla tamtej maszyny, popraw albo usuń.

## 7. Weryfikacja

- `zsh -ic 'echo ok'` bez błędów, prompt starship z różowym segmentem.
- `fc-list | grep -i "JetBrainsMono Nerd"` zwraca wynik.
- Ghostty otwiera się z neonową paletą i blurem.
- VS Code: Darcula, ikony JetBrains, brak błędów Custom UI Style.
- Na GNOME: przyciski po lewej, rogi zaokrąglone, dok na dole, blur w Ghostty. Na KDE: zrzut ekranu z traffic lights po lewej, zaokrąglonymi rogami i dokiem na dole. Pokaż go właścicielowi.

## 8. Claude Code: zasady uniwersalne

Katalog `claude/` w repo (nie ma go w archiwum tar.gz) zawiera zasady pracy niezależne od maszyny:

- `claude/CLAUDE.md`: globalne zasady (język, kod bez komentarzy, commity bez `Co-Authored-By`, weryfikacja przed końcem, oszczędzanie tokenów). Trafia do `~/.claude/CLAUDE.md`.
- `claude/token-efficiency.md`: pełne zasady zużycia tokenów i prompt cache z pomiarami i źródłami. Trafia do `~/.claude/token-efficiency.md`.
- `claude/settings.universal.json`: klucze do scalenia z `~/.claude/settings.json`. `attribution` z pustym `commit` i `pr` wyłącza stopki w commitach i PR-ach, `autoCompactWindow` 300000, `workflowSizeGuideline` small, subagenci na Sonnecie z cache 1 h, wyłączone podpowiedzi promptów i telemetria, effort per model, reguły deny dla wymuszonego pusha i twardego resetu w git.
- `claude/statusline.sh`: pasek stanu (model, effort, rozmiar kontekstu, limity 5 h i 7 dni, zimny cache). Wymaga `jq`.

```bash
B=https://raw.githubusercontent.com/adiyy2001/ricing-export/main/claude
mkdir -p ~/.claude && cd ~/.claude
for f in CLAUDE.md token-efficiency.md statusline.sh settings.universal.json; do
  [ -f "$f" ] && cp "$f" "$f.bak-$(date +%F)"
  curl -fsSLO "$B/$f"
done
chmod +x statusline.sh
[ -f settings.json ] || echo '{}' > settings.json
jq -s '.[0] * .[1]' settings.json settings.universal.json > settings.merged.json && mv settings.merged.json settings.json
```

Nie ma tu uprawnień `allow`, trybu uprawnień, hooków, skilli ani serwerów MCP z CachyOS, bo zależą od tamtej maszyny i kont. Zmiany w `settings.json` działają od następnej sesji.

## 9. Fabryka: praca bez nadzoru

Katalog `factory/` (nie ma go w archiwum tar.gz) zawiera mechanikę kolejek z CachyOS: konduktor, który bierze pozycje z `queue.json`, każdą daje świeżej sesji `claude -p`, sprawdza zakres plików, testy i bramkę, a commituje dopiero po bramce. Instrukcja wdrożenia w projekcie: `factory/README.md`. Zestaw do skopiowania: `factory/kit/`.
