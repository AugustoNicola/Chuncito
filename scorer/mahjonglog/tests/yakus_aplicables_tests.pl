% Tests de src/yakus_aplicables.pl: filtrado de yakus solapados/anulados.

:- begin_tests(yakus_aplicables).

sinFlags(situacion(este, sur, [], [], [])).

% ---- ryanpeikou anula a iipeikou ----

manoRyanpeikouDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(m2, m3, m4), escC(s6, s7, s8), escC(s6, s7, s8)
]).

test(ryanpeikou_anula_a_iipeikou) :-
    manoRyanpeikouDePrueba(Formas), sinFlags(Sit),
    yakusAplicables(victoria(Formas, p5, tsumo), Sit, Yakus),
    memberchk(ryanpeikou, Yakus),
    \+ memberchk(iipeikou, Yakus).

% una sola escalera repetida no debería activar ryanpeikou, solo iipeikou:
manoIipeikouDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(m2, m3, m4), triC(s5, s5, s5), escC(s6, s7, s8)
]).

test(iipeikou_solo_sin_ryanpeikou_no_se_anula) :-
    manoIipeikouDePrueba(Formas), sinFlags(Sit),
    yakusAplicables(victoria(Formas, p5, tsumo), Sit, Yakus),
    memberchk(iipeikou, Yakus),
    \+ memberchk(ryanpeikou, Yakus).

% ---- chinitsu anula a honitsu ----

manoChinitsuDePrueba([
    pareja(m1, m1), triC(m2, m2, m2), escC(m3, m4, m5), triC(m7, m7, m7), triC(m9, m9, m9)
]).

test(chinitsu_anula_a_honitsu) :-
    manoChinitsuDePrueba(Formas), sinFlags(Sit),
    yakusAplicables(victoria(Formas, m1, tsumo), Sit, Yakus),
    memberchk(chinitsu, Yakus),
    \+ memberchk(honitsu, Yakus).

% honor de por medio: solo satisface honitsu, no chinitsu, así que no debería anularse:
manoHonitsuDePrueba([
    pareja(n, n), triC(m2, m2, m2), escC(m3, m4, m5), triC(m7, m7, m7), triC(e, e, e)
]).

test(honitsu_solo_sin_chinitsu_no_se_anula) :-
    manoHonitsuDePrueba(Formas), sinFlags(Sit),
    yakusAplicables(victoria(Formas, n, ron), Sit, Yakus),
    memberchk(honitsu, Yakus),
    \+ memberchk(chinitsu, Yakus).

% ---- junchan anula a chanta ----

manoJunchanDePrueba([
    pareja(p1, p1), chii(m1, m2, m3), escC(p7, p8, p9), triC(s1, s1, s1), escC(s7, s8, s9)
]).

test(junchan_anula_a_chanta) :-
    manoJunchanDePrueba(Formas), sinFlags(Sit),
    yakusAplicables(victoria(Formas, p1, ron), Sit, Yakus),
    memberchk(junchan, Yakus),
    \+ memberchk(chanta, Yakus).

% honor de por medio: solo satisface chanta, no junchan:
manoChantaDePrueba([
    pareja(n, n), chii(m1, m2, m3), escC(p7, p8, p9), triC(s1, s1, s1), escC(s7, s8, s9)
]).

test(chanta_solo_sin_junchan_no_se_anula) :-
    manoChantaDePrueba(Formas), sinFlags(Sit),
    yakusAplicables(victoria(Formas, n, ron), Sit, Yakus),
    memberchk(chanta, Yakus),
    \+ memberchk(junchan, Yakus).

% ---- yakuman anula a cualquier yaku no-yakuman ----

% daisuushii (yakuman) también satisface estructuralmente toitoi (4 piernas)
% y shousuushii-como-condicion no aplica (no hay par de viento), pero sí
% aplica toitoi, que debe quedar anulado:
manoDaisuushiiDePrueba([
    pareja(p5, p5), triC(e, e, e), triC(s, s, s), triC(w, w, w), triC(n, n, n)
]).

test(daisuushii_anula_a_toitoi) :-
    manoDaisuushiiDePrueba(Formas), sinFlags(Sit),
    yakusAplicables(victoria(Formas, p5, tsumo), Sit, Yakus),
    memberchk(daisuushii, Yakus),
    \+ memberchk(toitoi, Yakus).

% un yakuman también anula yakus situacionales como riichi:
test(daisuushii_anula_a_riichi) :-
    manoDaisuushiiDePrueba(Formas),
    yakusAplicables(victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichi]), Yakus),
    memberchk(daisuushii, Yakus),
    \+ memberchk(riichi, Yakus).

% dos yakuman simultáneos: ninguno anula al otro (Yaku \== YakuMan en anula/2):
manoKokushiDePrueba(huerfanos(m1, m1, m9, p1, p9, s1, s9, e, s, w, n, wh, g, r)).

test(dos_yakuman_simultaneos_no_se_anulan_entre_si) :-
    manoKokushiDePrueba(Forma),
    yakusAplicables(victoria([Forma], m1, tsumo), situacion(este, este, [], [], [primeraRonda]), Yakus),
    memberchk(kokushiMusou, Yakus),
    memberchk(tenhou, Yakus).

% ---- yakus independientes (sin solapamiento) siguen apareciendo juntos ----

test(yakus_sin_solapamiento_no_se_anulan) :-
    manoRyanpeikouDePrueba(Formas), sinFlags(Sit),
    yakusAplicables(victoria(Formas, p5, tsumo), Sit, Yakus),
    % ryanpeikou y menzenTsumo no tienen relación de anulación entre sí:
    memberchk(ryanpeikou, Yakus),
    memberchk(menzenTsumo, Yakus).

% ---- toitoi + chanta: honroutou (compatible, todos cuentan) o chinroutou
% (yakuman, anula al resto) según haya o no honores ----

% con un pon (abierto) para que no dispare también san'ankou/suu'ankou y
% así aislar específicamente la relación toitoi+chanta+chin/honroutou:
manoToitoiChantaTerminalPuroDePrueba([
    pareja(p1, p1), pon(m1, m1, m1), triC(p9, p9, p9), triC(s1, s1, s1), triC(s9, s9, s9)
]).

manoToitoiChantaConHonorDePrueba([
    pareja(n, n), pon(m1, m1, m1), triC(p9, p9, p9), triC(s1, s1, s1), triC(s9, s9, s9)
]).

test(toitoi_y_chanta_puros_en_terminales_quedan_anulados_por_chinroutou) :-
    manoToitoiChantaTerminalPuroDePrueba(Formas), sinFlags(Sit),
    yakusAplicables(victoria(Formas, p1, tsumo), Sit, Yakus),
    Yakus == [chinroutou].

test(toitoi_y_chanta_con_honor_conviven_con_honroutou_sin_anularse) :-
    manoToitoiChantaConHonorDePrueba(Formas), sinFlags(Sit),
    yakusAplicables(victoria(Formas, n, tsumo), Sit, Yakus),
    memberchk(toitoi, Yakus),
    memberchk(chanta, Yakus),
    memberchk(honroutou, Yakus).

% ---- deduplicación de soluciones repetidas de un mismo yaku ----

test(yakusAplicables_no_repite_un_yaku_con_varias_soluciones) :-
    % sanshokuDoujun puede tener varias soluciones nondet (una por numeración
    % de escalera que no aplique), pero solo debe aparecer una vez en la lista:
    manoRyanpeikouDePrueba(Formas), sinFlags(Sit),
    yakusAplicables(victoria(Formas, p5, tsumo), Sit, Yakus),
    list_to_set(Yakus, Yakus).

% ---- reglas de la casa: riichiAbiertoRonYakuman ----

test(yakus_aplicables_3_equivale_a_4_sin_reglas) :-
    manoDaisuushiiDePrueba(Formas),
    Sit = situacion(este, sur, [], [], [riichiAbierto]),
    yakusAplicables(victoria(Formas, p5, ron), Sit, Yakus3),
    yakusAplicables(victoria(Formas, p5, ron), Sit, [], Yakus4),
    Yakus3 == Yakus4.

test(riichiAbierto_sin_regla_es_yaku_normal) :-
    manoRyanpeikouDePrueba(Formas),
    yakusAplicables(victoria(Formas, p5, ron), situacion(este, sur, [], [], [riichiAbierto]), Yakus),
    memberchk(riichiAbierto, Yakus),
    memberchk(ryanpeikou, Yakus),
    \+ memberchk(riichiAbiertoRon, Yakus).

% el yakuman anula a riichiAbierto y a cualquier otro yaku no-yakuman:
test(riichiAbierto_ron_con_regla_es_solo_yakuman) :-
    manoRyanpeikouDePrueba(Formas),
    yakusAplicables(victoria(Formas, p5, ron), situacion(este, sur, [], [], [riichiAbierto, ippatsu]),
        [riichiAbiertoRonYakuman], Yakus),
    Yakus == [riichiAbiertoRon].

test(riichiAbierto_tsumo_con_regla_no_es_yakuman) :-
    manoRyanpeikouDePrueba(Formas),
    yakusAplicables(victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichiAbierto]),
        [riichiAbiertoRonYakuman], Yakus),
    memberchk(riichiAbierto, Yakus),
    \+ memberchk(riichiAbiertoRon, Yakus).

test(riichiAbiertoRon_se_suma_a_otro_yakuman) :-
    manoDaisuushiiDePrueba(Formas),
    yakusAplicables(victoria(Formas, p5, ron), situacion(este, sur, [], [], [riichiAbierto]),
        [riichiAbiertoRonYakuman], Yakus),
    memberchk(daisuushii, Yakus),
    memberchk(riichiAbiertoRon, Yakus).

:- end_tests(yakus_aplicables).
