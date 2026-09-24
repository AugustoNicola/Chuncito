% Tests de src/yakus.pl: condiciones de cada yaku.

:- begin_tests(yakus).

manoTanyaoDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(p2, p3, p4), triC(s5, s5, s5), escC(s6, s7, s8)
]).

manoConTerminalDePrueba([
    pareja(n, n), escC(m1, m2, m3), escC(p2, p3, p4), triC(s5, s5, s5), escC(s6, s7, s8)
]).

manoConLlamadaDePrueba([
    pareja(n, n), chii(m2, m3, m4), escC(p2, p3, p4), triC(s5, s5, s5), escC(s6, s7, s8)
]).

sinFlags(situacion(este, sur, [], [], [])).

% ---- tanyao ----

test(tanyao_aplica_a_mano_toda_simples) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    once(yaku(tanyao, victoria(Formas, p5, tsumo), Sit)).

test(tanyao_falla_con_terminal) :-
    manoConTerminalDePrueba(Formas), sinFlags(Sit),
    \+ yaku(tanyao, victoria(Formas, n, tsumo), Sit).

test(tanyao_falla_con_honor_en_el_par) :-
    manoConLlamadaDePrueba(Formas), sinFlags(Sit),
    \+ yaku(tanyao, victoria(Formas, n, ron), Sit).

% ---- menzen tsumo ----

test(menzen_tsumo_aplica_a_mano_cerrada_por_tsumo) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    once(yaku(menzenTsumo, victoria(Formas, p5, tsumo), Sit)).

test(menzen_tsumo_falla_con_llamada) :-
    manoConLlamadaDePrueba(Formas), sinFlags(Sit),
    \+ yaku(menzenTsumo, victoria(Formas, n, tsumo), Sit).

test(menzen_tsumo_falla_con_ron) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(menzenTsumo, victoria(Formas, p5, ron), Sit).

% ---- iipeikou ----

manoIipeikouDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(m2, m3, m4), triC(s5, s5, s5), escC(s6, s7, s8)
]).

test(iipeikou_aplica_con_dos_escaleras_iguales) :-
    manoIipeikouDePrueba(Formas), sinFlags(Sit),
    once(yaku(iipeikou, victoria(Formas, p5, tsumo), Sit)).

test(iipeikou_falla_sin_escaleras_repetidas) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(iipeikou, victoria(Formas, p5, tsumo), Sit).

test(iipeikou_falla_con_llamada) :-
    manoConLlamadaDePrueba(Formas), sinFlags(Sit),
    \+ yaku(iipeikou, victoria(Formas, n, tsumo), Sit).

% ---- ryanpeikou ----

manoRyanpeikouDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(m2, m3, m4), escC(s6, s7, s8), escC(s6, s7, s8)
]).

test(ryanpeikou_aplica_con_dos_pares_de_escaleras_iguales) :-
    manoRyanpeikouDePrueba(Formas), sinFlags(Sit),
    once(yaku(ryanpeikou, victoria(Formas, p5, tsumo), Sit)).

test(ryanpeikou_falla_con_un_solo_par_de_escaleras_iguales) :-
    manoIipeikouDePrueba(Formas), sinFlags(Sit),
    \+ yaku(ryanpeikou, victoria(Formas, p5, tsumo), Sit).

% ---- sanshoku doujun ----

manoSanshokuDePrueba([
    pareja(n, n), escC(m2, m3, m4), escC(p2, p3, p4), escC(s2, s3, s4), triC(s5, s5, s5)
]).

test(sanshoku_aplica_con_misma_escalera_en_tres_palos) :-
    manoSanshokuDePrueba(Formas), sinFlags(Sit),
    once(yaku(sanshokuDoujun, victoria(Formas, n, tsumo), Sit)).

test(sanshoku_falla_sin_los_tres_palos) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(sanshokuDoujun, victoria(Formas, p5, tsumo), Sit).

% ---- ittsuu ----

manoIttsuuDePrueba([
    pareja(p5, p5), escC(m1, m2, m3), escC(m4, m5, m6), escC(m7, m8, m9), triC(s5, s5, s5)
]).

test(ittsuu_aplica_con_las_tres_escaleras_del_mismo_palo) :-
    manoIttsuuDePrueba(Formas), sinFlags(Sit),
    once(yaku(ittsuu, victoria(Formas, p5, tsumo), Sit)).

test(ittsuu_falla_sin_las_tres_escaleras) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(ittsuu, victoria(Formas, p5, tsumo), Sit).

% ---- yakuhai: viento de ronda / jugador ----

manoConPiernaVientoDePrueba(Viento, [
    pareja(p5, p5), triC(Viento, Viento, Viento), escC(m2, m3, m4), escC(p2, p3, p4), escC(s6, s7, s8)
]).

test(bakazehai_aplica_con_pierna_del_viento_de_ronda) :-
    manoConPiernaVientoDePrueba(e, Formas),
    once(yaku(bakazehai, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], []))).

test(bakazehai_aplica_con_viento_oeste) :-
    manoConPiernaVientoDePrueba(w, Formas),
    once(yaku(bakazehai, victoria(Formas, p5, tsumo), situacion(oeste, sur, [], [], []))).

test(bakazehai_falla_si_no_coincide_con_viento_de_ronda) :-
    manoConPiernaVientoDePrueba(e, Formas),
    \+ yaku(bakazehai, victoria(Formas, p5, tsumo), situacion(sur, sur, [], [], [])).

test(jikazehai_aplica_con_pierna_del_viento_del_jugador) :-
    manoConPiernaVientoDePrueba(n, Formas),
    once(yaku(jikazehai, victoria(Formas, p5, tsumo), situacion(este, norte, [], [], []))).

test(jikazehai_falla_si_no_coincide_con_viento_del_jugador) :-
    manoConPiernaVientoDePrueba(n, Formas),
    \+ yaku(jikazehai, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [])).

% ---- sangenpai (dragones) ----

manoConPiernaDragonDePrueba(Dragon, [
    pareja(p5, p5), triC(Dragon, Dragon, Dragon), escC(m2, m3, m4), escC(p2, p3, p4), escC(s6, s7, s8)
]).

test(chun_aplica_con_pierna_de_dragon_rojo) :-
    manoConPiernaDragonDePrueba(r, Formas), sinFlags(Sit),
    once(yaku(chun, victoria(Formas, p5, tsumo), Sit)).

test(chun_falla_sin_dragon_rojo) :-
    manoConPiernaDragonDePrueba(g, Formas), sinFlags(Sit),
    \+ yaku(chun, victoria(Formas, p5, tsumo), Sit).

test(hatsu_aplica_con_pierna_de_dragon_verde) :-
    manoConPiernaDragonDePrueba(g, Formas), sinFlags(Sit),
    once(yaku(hatsu, victoria(Formas, p5, tsumo), Sit)).

test(hatsu_falla_sin_dragon_verde) :-
    manoConPiernaDragonDePrueba(r, Formas), sinFlags(Sit),
    \+ yaku(hatsu, victoria(Formas, p5, tsumo), Sit).

test(haku_aplica_con_pierna_de_dragon_blanco) :-
    manoConPiernaDragonDePrueba(wh, Formas), sinFlags(Sit),
    once(yaku(haku, victoria(Formas, p5, tsumo), Sit)).

test(haku_falla_sin_dragon_blanco) :-
    manoConPiernaDragonDePrueba(g, Formas), sinFlags(Sit),
    \+ yaku(haku, victoria(Formas, p5, tsumo), Sit).

% ---- shousangen / daisangen ----

manoShousangenDePrueba([
    pareja(r, r), triC(g, g, g), triC(wh, wh, wh), escC(m2, m3, m4), escC(s6, s7, s8)
]).

manoDaisangenDePrueba([
    pareja(p5, p5), triC(r, r, r), triC(g, g, g), triC(wh, wh, wh), escC(m2, m3, m4)
]).

test(shousangen_aplica_con_par_y_dos_piernas_de_dragon) :-
    manoShousangenDePrueba(Formas), sinFlags(Sit),
    once(yaku(shousangen, victoria(Formas, r, tsumo), Sit)).

test(shousangen_falla_con_tres_piernas_de_dragon_sin_par_de_dragon) :-
    manoDaisangenDePrueba(Formas), sinFlags(Sit),
    \+ yaku(shousangen, victoria(Formas, p5, tsumo), Sit).

test(daisangen_aplica_con_tres_piernas_de_dragon) :-
    manoDaisangenDePrueba(Formas), sinFlags(Sit),
    once(yaku(daisangen, victoria(Formas, p5, tsumo), Sit)).

test(daisangen_falla_con_solo_dos_piernas_de_dragon) :-
    manoShousangenDePrueba(Formas), sinFlags(Sit),
    \+ yaku(daisangen, victoria(Formas, r, tsumo), Sit).

% ---- shousuushii / daisuushii ----

manoShousuushiiDePrueba([
    pareja(e, e), triC(s, s, s), triC(w, w, w), triC(n, n, n), escC(m2, m3, m4)
]).

manoDaisuushiiDePrueba([
    pareja(p5, p5), triC(e, e, e), triC(s, s, s), triC(w, w, w), triC(n, n, n)
]).

test(shousuushii_aplica_con_par_y_tres_piernas_de_viento) :-
    manoShousuushiiDePrueba(Formas), sinFlags(Sit),
    once(yaku(shousuushii, victoria(Formas, e, tsumo), Sit)).

test(shousuushii_falla_con_cuatro_piernas_de_viento_sin_par_de_viento) :-
    manoDaisuushiiDePrueba(Formas), sinFlags(Sit),
    \+ yaku(shousuushii, victoria(Formas, p5, tsumo), Sit).

test(daisuushii_aplica_con_cuatro_piernas_de_viento) :-
    manoDaisuushiiDePrueba(Formas), sinFlags(Sit),
    once(yaku(daisuushii, victoria(Formas, p5, tsumo), Sit)).

test(daisuushii_falla_con_solo_tres_piernas_de_viento) :-
    manoShousuushiiDePrueba(Formas), sinFlags(Sit),
    \+ yaku(daisuushii, victoria(Formas, e, tsumo), Sit).

% ---- chanta / junchan / honroutou / chinroutou / tsuuiisou ----

manoChantaDePrueba([
    pareja(n, n), chii(m1, m2, m3), escC(p7, p8, p9), triC(s1, s1, s1), escC(s7, s8, s9)
]).

manoJunchanDePrueba([
    pareja(p1, p1), chii(m1, m2, m3), escC(p7, p8, p9), triC(s1, s1, s1), escC(s7, s8, s9)
]).

manoHonroutouDePrueba([
    pareja(n, n), triC(s1, s1, s1), triC(m9, m9, m9), triC(p1, p1, p1), triC(r, r, r)
]).

manoChinroutouDePrueba([
    pareja(p1, p1), triC(m1, m1, m1), triC(m9, m9, m9), triC(s1, s1, s1), triC(s9, s9, s9)
]).

manoTsuuiisouDePrueba([
    pareja(n, n), triC(e, e, e), triC(s, s, s), triC(r, r, r), triC(g, g, g)
]).

test(chanta_aplica_con_terminal_u_honor_en_cada_forma) :-
    manoChantaDePrueba(Formas), sinFlags(Sit),
    once(yaku(chanta, victoria(Formas, n, ron), Sit)).

test(chanta_falla_con_forma_toda_simples) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(chanta, victoria(Formas, p5, tsumo), Sit).

test(junchan_aplica_con_terminal_en_cada_forma_sin_honores) :-
    manoJunchanDePrueba(Formas), sinFlags(Sit),
    once(yaku(junchan, victoria(Formas, p1, ron), Sit)).

test(junchan_falla_con_par_de_honores) :-
    manoChantaDePrueba(Formas), sinFlags(Sit),
    \+ yaku(junchan, victoria(Formas, n, ron), Sit).

test(honroutou_aplica_con_solo_terminales_y_honores) :-
    manoHonroutouDePrueba(Formas), sinFlags(Sit),
    once(yaku(honroutou, victoria(Formas, n, tsumo), Sit)).

test(honroutou_falla_con_escalera) :-
    manoChantaDePrueba(Formas), sinFlags(Sit),
    \+ yaku(honroutou, victoria(Formas, n, ron), Sit).

test(chinroutou_aplica_con_solo_terminales) :-
    manoChinroutouDePrueba(Formas), sinFlags(Sit),
    once(yaku(chinroutou, victoria(Formas, p1, tsumo), Sit)).

test(chinroutou_falla_con_honores) :-
    manoHonroutouDePrueba(Formas), sinFlags(Sit),
    \+ yaku(chinroutou, victoria(Formas, n, tsumo), Sit).

test(tsuuiisou_aplica_con_solo_honores) :-
    manoTsuuiisouDePrueba(Formas), sinFlags(Sit),
    once(yaku(tsuuiisou, victoria(Formas, n, tsumo), Sit)).

test(tsuuiisou_falla_con_terminales_numericos) :-
    manoChinroutouDePrueba(Formas), sinFlags(Sit),
    \+ yaku(tsuuiisou, victoria(Formas, p1, tsumo), Sit).

% ---- kokushi musou ----

manoKokushiDePrueba(huerfanos(m1, m1, m9, p1, p9, s1, s9, e, s, w, n, wh, g, r)).

test(kokushi_aplica_con_los_trece_huerfanos_mas_uno_repetido) :-
    manoKokushiDePrueba(Forma), sinFlags(Sit),
    once(yaku(kokushiMusou, victoria([Forma], m1, tsumo), Sit)).

test(kokushi_falla_con_mano_estandar) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(kokushiMusou, victoria(Formas, p5, tsumo), Sit).

% ---- chiitoitsu ----

manoChiitoitsuDePrueba([
    pareja(m1, m1), pareja(m9, m9), pareja(p2, p2), pareja(p5, p5),
    pareja(s3, s3), pareja(s7, s7), pareja(n, n)
]).

test(chiitoitsu_aplica_con_siete_pares) :-
    manoChiitoitsuDePrueba(Formas), sinFlags(Sit),
    once(yaku(chiitoitsu, victoria(Formas, m1, tsumo), Sit)).

test(chiitoitsu_falla_con_mano_estandar) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(chiitoitsu, victoria(Formas, p5, tsumo), Sit).

% ---- chiitoitsu no es compatible con rinshan/chankan ----

test(chiitoitsu_no_es_compatible_con_chankan) :-
    manoChiitoitsuDePrueba(Formas),
    \+ yaku(chankan, victoria(Formas, m1, ron), situacion(este, sur, [], [], [chankan])).

test(chiitoitsu_no_es_compatible_con_rinshan) :-
    % ya es imposible estructuralmente (Formas nunca tiene un quad), pero
    % lo confirmamos explícitamente como regresión:
    manoChiitoitsuDePrueba(Formas),
    \+ yaku(rinshan, victoria(Formas, m1, tsumo), situacion(este, sur, [], [], [rinshan])).

% ---- toitoi / san'ankou / suu'ankou ----

manoToitoiDePrueba([
    pareja(p5, p5), pon(m2, m2, m2), triC(p3, p3, p3), pon(s4, s4, s4), triC(s7, s7, s7)
]).

manoSanAnkouDePrueba([
    pareja(p5, p5), triC(m2, m2, m2), triC(p3, p3, p3), triC(s7, s7, s7), pon(s4, s4, s4)
]).

manoSuuAnkouDePrueba([
    pareja(p5, p5), triC(m2, m2, m2), triC(p3, p3, p3), triC(s7, s7, s7), triC(s4, s4, s4)
]).

test(toitoi_aplica_con_cuatro_piernas) :-
    manoToitoiDePrueba(Formas), sinFlags(Sit),
    once(yaku(toitoi, victoria(Formas, p5, tsumo), Sit)).

test(toitoi_falla_con_escaleras) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(toitoi, victoria(Formas, p5, tsumo), Sit).

test(sanAnkou_aplica_con_tres_piernas_ocultas_y_una_llamada) :-
    manoSanAnkouDePrueba(Formas), sinFlags(Sit),
    once(yaku(sanAnkou, victoria(Formas, p5, tsumo), Sit)).

test(sanAnkou_falla_con_cuatro_piernas_ocultas) :-
    manoSuuAnkouDePrueba(Formas), sinFlags(Sit),
    \+ yaku(sanAnkou, victoria(Formas, p5, tsumo), Sit).

test(suuAnkou_aplica_con_cuatro_piernas_ocultas) :-
    manoSuuAnkouDePrueba(Formas), sinFlags(Sit),
    once(yaku(suuAnkou, victoria(Formas, p5, tsumo), Sit)).

test(suuAnkou_falla_con_tres_piernas_ocultas_y_una_llamada) :-
    manoSanAnkouDePrueba(Formas), sinFlags(Sit),
    \+ yaku(suuAnkou, victoria(Formas, p5, tsumo), Sit).

% una tripla oculta completada por ron (p.ej. espera shanpon) no cuenta
% como concealed para efectos de san'ankou/suu'ankou:
test(suuAnkou_falla_si_el_ron_completa_una_de_las_piernas) :-
    manoSuuAnkouDePrueba(Formas),
    \+ yaku(suuAnkou, victoria(Formas, s7, ron), situacion(este, sur, [], [], [])).

test(suuAnkou_aplica_si_el_ron_completa_el_par_no_una_pierna) :-
    % la ficha ganadora viene del par (p5), no de ninguna tripla: las
    % cuatro triplas siguen siendo concealed.
    manoSuuAnkouDePrueba(Formas),
    once(yaku(suuAnkou, victoria(Formas, p5, ron), situacion(este, sur, [], [], []))).

test(sanAnkou_falla_si_el_ron_completa_una_de_las_piernas_ocultas) :-
    % de las tres triplas ocultas de manoSanAnkouDePrueba, s7 gana por ron:
    % solo quedan dos piernas concealed, no tres.
    manoSanAnkouDePrueba(Formas),
    \+ yaku(sanAnkou, victoria(Formas, s7, ron), situacion(este, sur, [], [], [])).

test(sanAnkou_aplica_aunque_suuAnkou_se_degrade_por_el_ron) :-
    % una mano de cuatro triplas ocultas que gana por ron en una de ellas
    % deja de ser suu'ankou, pero las tres restantes siguen siendo
    % san'ankou (el jugador se queda con la interpretación que sí aplica):
    manoSuuAnkouDePrueba(Formas),
    once(yaku(sanAnkou, victoria(Formas, s7, ron), situacion(este, sur, [], [], []))).

% cuando la ficha ganadora podría haber entrado a más de una Forma (una
% tripla ya completa y una escalera con kanchan, ambas con el mismo
% valor), alcanza con que UNA asignación deje las piernas necesarias:
manoAnkouAmbiguoDePrueba([
    pareja(m5, m5), triC(p3, p3, p3), triC(s1, s1, s1), triC(s9, s9, s9), escC(p2, p3, p4)
]).

test(sanAnkou_aplica_cuando_el_ron_pudo_haber_entrado_a_la_escalera) :-
    % triC(p3,p3,p3) ya estaba completa; el ron en p3 pudo haber completado
    % la escalera p2-p3-p4 en vez de convertir la tripla en minko:
    manoAnkouAmbiguoDePrueba(Formas),
    once(yaku(sanAnkou, victoria(Formas, p3, ron), situacion(este, sur, [], [], []))).

% ---- san'kantsu / suu'kantsu ----

manoSanKantsuDePrueba([
    pareja(p5, p5), kanC(m2, m2, m2, m2), kanA(p3, p3, p3, p3), kanC(s7, s7, s7, s7), triC(s4, s4, s4)
]).

manoSuuKantsuDePrueba([
    pareja(p5, p5), kanC(m2, m2, m2, m2), kanA(p3, p3, p3, p3), kanC(s7, s7, s7, s7), kanA(s4, s4, s4, s4)
]).

test(sanKantsu_aplica_con_tres_quads) :-
    manoSanKantsuDePrueba(Formas), sinFlags(Sit),
    once(yaku(sanKantsu, victoria(Formas, p5, tsumo), Sit)).

test(sanKantsu_falla_con_cuatro_quads) :-
    manoSuuKantsuDePrueba(Formas), sinFlags(Sit),
    \+ yaku(sanKantsu, victoria(Formas, p5, tsumo), Sit).

test(suuKantsu_aplica_con_cuatro_quads) :-
    manoSuuKantsuDePrueba(Formas), sinFlags(Sit),
    once(yaku(suuKantsu, victoria(Formas, p5, tsumo), Sit)).

test(suuKantsu_falla_con_tres_quads) :-
    manoSanKantsuDePrueba(Formas), sinFlags(Sit),
    \+ yaku(suuKantsu, victoria(Formas, p5, tsumo), Sit).

% ---- honitsu / chinitsu ----

manoHonitsuDePrueba([
    pareja(n, n), triC(m2, m2, m2), escC(m3, m4, m5), triC(m7, m7, m7), triC(e, e, e)
]).

manoChinitsuDePrueba([
    pareja(m1, m1), triC(m2, m2, m2), escC(m3, m4, m5), triC(m7, m7, m7), triC(m9, m9, m9)
]).

test(honitsu_aplica_con_un_palo_mas_honores) :-
    manoHonitsuDePrueba(Formas), sinFlags(Sit),
    once(yaku(honitsu, victoria(Formas, n, ron), Sit)).

test(honitsu_falla_con_varios_palos) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(honitsu, victoria(Formas, p5, tsumo), Sit).

test(chinitsu_aplica_con_un_solo_palo_sin_honores) :-
    manoChinitsuDePrueba(Formas), sinFlags(Sit),
    once(yaku(chinitsu, victoria(Formas, m1, tsumo), Sit)).

test(chinitsu_falla_con_honores) :-
    manoHonitsuDePrueba(Formas), sinFlags(Sit),
    \+ yaku(chinitsu, victoria(Formas, n, ron), Sit).

% ---- ryuuiisou ----

manoRyuuiisouDePrueba([
    pareja(s2, s2), triC(s3, s3, s3), escC(s2, s3, s4), triC(g, g, g), triC(s6, s6, s6)
]).

test(ryuuiisou_aplica_con_solo_fichas_verdes) :-
    manoRyuuiisouDePrueba(Formas), sinFlags(Sit),
    once(yaku(ryuuiisou, victoria(Formas, s2, tsumo), Sit)).

test(ryuuiisou_falla_con_ficha_no_verde) :-
    manoHonitsuDePrueba(Formas), sinFlags(Sit),
    \+ yaku(ryuuiisou, victoria(Formas, n, ron), Sit).

% ---- chuuren poutou ----

manoChuurenPoutouDePrueba([
    pareja(m5, m5), triC(m1, m1, m1), escC(m2, m3, m4), escC(m6, m7, m8), triC(m9, m9, m9)
]).

test(chuurenPoutou_aplica_con_la_forma_de_nueve_puertas) :-
    manoChuurenPoutouDePrueba(Formas), sinFlags(Sit),
    once(yaku(chuurenPoutou, victoria(Formas, m5, tsumo), Sit)).

test(chuurenPoutou_falla_con_varios_palos) :-
    manoHonitsuDePrueba(Formas), sinFlags(Sit),
    \+ yaku(chuurenPoutou, victoria(Formas, n, ron), Sit).

test(chuurenPoutou_falla_con_llamada) :-
    manoConLlamadaDePrueba(Formas), sinFlags(Sit),
    \+ yaku(chuurenPoutou, victoria(Formas, n, ron), Sit).

% ---- espera ryanmen ----

manoEsperaDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(p2, p3, p4), triC(s5, s5, s5), escC(s7, s8, s9)
]).

test(esperaRyanmen_aplica_al_extremo_inferior) :-
    % m2,m3,m4: ganando con m2 (extremo inferior), podría haber completado con m5 también.
    manoEsperaDePrueba(Formas),
    once(esperaRyanmen(Formas, m2)).

test(esperaRyanmen_aplica_al_extremo_superior) :-
    % m2,m3,m4: ganando con m4 (extremo superior), podría haber completado con m1 también.
    manoEsperaDePrueba(Formas),
    once(esperaRyanmen(Formas, m4)).

test(esperaRyanmen_falla_con_espera_kanchan) :-
    % m2,m3,m4: ganando con m3 (el medio), solo esa ficha completaba.
    manoEsperaDePrueba(Formas),
    \+ esperaRyanmen(Formas, m3).

test(esperaRyanmen_falla_con_penchan_borde_superior) :-
    % p2,p3,p4 no es de borde; usamos m1,m2,m3 vía manoConTerminalDePrueba:
    % ganando con m3, solo esa ficha completaba (no existe m0).
    manoConTerminalDePrueba(Formas),
    \+ esperaRyanmen(Formas, m3).

test(esperaRyanmen_falla_con_penchan_borde_inferior) :-
    % s7,s8,s9: ganando con s7, solo esa ficha completaba (no existe s10).
    manoEsperaDePrueba(Formas),
    \+ esperaRyanmen(Formas, s7).

test(esperaRyanmen_falla_si_la_ficha_viene_de_una_llamada) :-
    % chii(m2,m3,m4) es una llamada: la ficha ganadora nunca viene de ahí.
    manoConLlamadaDePrueba(Formas),
    \+ esperaRyanmen(Formas, m2).

% ---- pinfu ----

manoPinfuDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(p2, p3, p4), escC(s2, s3, s4), escC(s7, s8, s9)
]).

manoPinfuParYakuhaiDePrueba([
    pareja(r, r), escC(m2, m3, m4), escC(p2, p3, p4), escC(s2, s3, s4), escC(s7, s8, s9)
]).

manoPinfuParVientoDePrueba([
    pareja(e, e), escC(m2, m3, m4), escC(p2, p3, p4), escC(s2, s3, s4), escC(s7, s8, s9)
]).

test(pinfu_aplica_con_solo_secuencias_par_sin_valor_y_espera_ryanmen) :-
    manoPinfuDePrueba(Formas),
    once(yaku(pinfu, victoria(Formas, m2, ron), situacion(este, sur, [], [], []))).

test(pinfu_falla_con_alguna_tripla) :-
    manoEsperaDePrueba(Formas),
    \+ yaku(pinfu, victoria(Formas, m2, ron), situacion(este, sur, [], [], [])).

test(pinfu_falla_con_par_de_dragon) :-
    manoPinfuParYakuhaiDePrueba(Formas),
    \+ yaku(pinfu, victoria(Formas, m2, ron), situacion(este, sur, [], [], [])).

test(pinfu_falla_con_par_del_viento_de_ronda) :-
    % e (este) es el viento de ronda en esta situacion:
    manoPinfuParVientoDePrueba(Formas),
    \+ yaku(pinfu, victoria(Formas, m2, ron), situacion(este, sur, [], [], [])).

test(pinfu_falla_con_espera_kanchan) :-
    manoPinfuDePrueba(Formas),
    \+ yaku(pinfu, victoria(Formas, m3, ron), situacion(este, sur, [], [], [])).

test(pinfu_falla_con_llamada) :-
    manoConLlamadaDePrueba(Formas),
    \+ yaku(pinfu, victoria(Formas, m2, ron), situacion(este, sur, [], [], [])).

% ---- sanshoku doukou ----

manoSanshokuDoukouDePrueba([
    pareja(n, n), triC(m5, m5, m5), triC(p5, p5, p5), triC(s5, s5, s5), escC(m2, m3, m4)
]).

test(sanshokuDoukou_aplica_con_la_misma_tripla_en_tres_palos) :-
    manoSanshokuDoukouDePrueba(Formas), sinFlags(Sit),
    once(yaku(sanshokuDoukou, victoria(Formas, n, tsumo), Sit)).

test(sanshokuDoukou_falla_sin_los_tres_palos) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(sanshokuDoukou, victoria(Formas, p5, tsumo), Sit).

% regresión del bug donde sanshokuDoukou compartía el nombre de sanshokuDoujun:
test(sanshokuDoujun_no_aplica_a_mano_de_triplas) :-
    manoSanshokuDoukouDePrueba(Formas), sinFlags(Sit),
    \+ yaku(sanshokuDoujun, victoria(Formas, n, tsumo), Sit).

test(sanshokuDoukou_no_aplica_a_mano_de_escaleras) :-
    manoSanshokuDePrueba(Formas), sinFlags(Sit),
    \+ yaku(sanshokuDoukou, victoria(Formas, n, tsumo), Sit).

% ---- riichi / doble riichi / ippatsu ----

test(riichi_aplica_con_flag_riichi) :-
    manoTanyaoDePrueba(Formas),
    once(yaku(riichi, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichi]))).

test(riichi_falla_sin_flag) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(riichi, victoria(Formas, p5, tsumo), Sit).

test(dobleRiichi_aplica_con_flag_dobleRiichi) :-
    manoTanyaoDePrueba(Formas),
    once(yaku(dobleRiichi, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [dobleRiichi]))).

test(dobleRiichi_falla_con_solo_riichi_simple) :-
    manoTanyaoDePrueba(Formas),
    \+ yaku(dobleRiichi, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichi])).

test(ippatsu_aplica_con_flag_ippatsu) :-
    manoTanyaoDePrueba(Formas),
    once(yaku(ippatsu, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichi, ippatsu]))).

test(ippatsu_falla_sin_flag) :-
    manoTanyaoDePrueba(Formas),
    \+ yaku(ippatsu, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichi])).

% ---- haitei / houtei / rinshan / chankan ----

test(haitei_aplica_con_flag) :-
    manoTanyaoDePrueba(Formas),
    once(yaku(haitei, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [haitei]))).

test(haitei_falla_sin_flag) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(haitei, victoria(Formas, p5, tsumo), Sit).

test(haitei_falla_por_ron) :-
    % haitei es robar la última ficha del muro vivo: solo existe por tsumo.
    manoTanyaoDePrueba(Formas),
    \+ yaku(haitei, victoria(Formas, p5, ron), situacion(este, sur, [], [], [haitei])).

test(houtei_aplica_con_flag) :-
    manoTanyaoDePrueba(Formas),
    once(yaku(houtei, victoria(Formas, p5, ron), situacion(este, sur, [], [], [houtei]))).

test(houtei_falla_sin_flag) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(houtei, victoria(Formas, p5, ron), Sit).

test(houtei_falla_por_tsumo) :-
    % houtei es robar el último descarte de la ronda: solo existe por ron.
    manoTanyaoDePrueba(Formas),
    \+ yaku(houtei, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [houtei])).

manoConKanDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(p2, p3, p4), kanC(s5, s5, s5, s5), escC(s6, s7, s8)
]).

test(rinshan_aplica_con_flag_y_un_kan) :-
    manoConKanDePrueba(Formas),
    once(yaku(rinshan, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [rinshan]))).

test(rinshan_falla_sin_flag) :-
    manoConKanDePrueba(Formas), sinFlags(Sit),
    \+ yaku(rinshan, victoria(Formas, p5, tsumo), Sit).

test(rinshan_falla_por_ron) :-
    % rinshan es ganar con la ficha de reemplazo tras un kan propio: solo existe por tsumo.
    manoConKanDePrueba(Formas),
    \+ yaku(rinshan, victoria(Formas, p5, ron), situacion(este, sur, [], [], [rinshan])).

test(rinshan_falla_sin_ningun_kan_en_la_mano) :-
    % la bandera sola no alcanza: rinshan exige que la mano tenga un kan.
    manoTanyaoDePrueba(Formas),
    \+ yaku(rinshan, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [rinshan])).

% rinshan exige un quad, y pinfu exige que las cuatro formas sean
% escaleras: son estructuralmente incompatibles, nunca aplican juntos.
test(rinshan_y_pinfu_son_incompatibles) :-
    manoPinfuDePrueba(Formas),
    \+ yaku(rinshan, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [rinshan])).

test(chankan_aplica_con_flag) :-
    manoTanyaoDePrueba(Formas),
    once(yaku(chankan, victoria(Formas, p5, ron), situacion(este, sur, [], [], [chankan]))).

test(chankan_falla_sin_flag) :-
    manoTanyaoDePrueba(Formas), sinFlags(Sit),
    \+ yaku(chankan, victoria(Formas, p5, ron), Sit).

test(chankan_falla_por_tsumo) :-
    % chankan es robar la ficha que otro agrega a un pon para formar un kan: solo existe por ron.
    manoTanyaoDePrueba(Formas),
    \+ yaku(chankan, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [chankan])).

% ---- tenhou / chiihou / renhou ----

test(tenhou_aplica_a_repartidor_que_roba_en_su_primer_turno) :-
    manoTanyaoDePrueba(Formas),
    once(yaku(tenhou, victoria(Formas, p5, tsumo), situacion(este, este, [], [], [primeraRonda]))).

test(tenhou_falla_si_no_es_repartidor) :-
    manoTanyaoDePrueba(Formas),
    \+ yaku(tenhou, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [primeraRonda])).

test(tenhou_falla_por_ron) :-
    manoTanyaoDePrueba(Formas),
    \+ yaku(tenhou, victoria(Formas, p5, ron), situacion(este, este, [], [], [primeraRonda])).

test(tenhou_falla_sin_flag) :-
    manoTanyaoDePrueba(Formas),
    \+ yaku(tenhou, victoria(Formas, p5, tsumo), situacion(este, este, [], [], [])).

test(chiihou_aplica_a_no_repartidor_que_roba_en_su_primer_turno) :-
    manoTanyaoDePrueba(Formas),
    once(yaku(chiihou, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [primeraRonda]))).

test(chiihou_falla_si_es_repartidor) :-
    % un repartidor en su primer turno es tenhou, no chiihou:
    manoTanyaoDePrueba(Formas),
    \+ yaku(chiihou, victoria(Formas, p5, tsumo), situacion(este, este, [], [], [primeraRonda])).

test(chiihou_falla_por_ron) :-
    manoTanyaoDePrueba(Formas),
    \+ yaku(chiihou, victoria(Formas, p5, ron), situacion(este, sur, [], [], [primeraRonda])).

test(renhou_aplica_a_no_repartidor_que_gana_por_ron_antes_de_su_primer_turno) :-
    manoTanyaoDePrueba(Formas),
    once(yaku(renhou, victoria(Formas, p5, ron), situacion(este, sur, [], [], [primeraRonda]))).

test(renhou_falla_si_es_repartidor) :-
    % el repartidor nunca puede robar un descarte antes de su propio primer turno:
    manoTanyaoDePrueba(Formas),
    \+ yaku(renhou, victoria(Formas, p5, ron), situacion(este, este, [], [], [primeraRonda])).

test(renhou_falla_por_tsumo) :-
    manoTanyaoDePrueba(Formas),
    \+ yaku(renhou, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [primeraRonda])).

% ---- riichiAbierto (open riichi) y yakus de reglas de la casa ----

test(riichiAbierto_aplica_con_flag_riichiAbierto) :-
    manoTanyaoDePrueba(Formas),
    once(yaku(riichiAbierto, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichiAbierto]))).

test(riichiAbierto_falla_con_riichi_simple) :-
    manoTanyaoDePrueba(Formas),
    \+ yaku(riichiAbierto, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichi])).

test(riichi_falla_con_riichiAbierto) :-
    manoTanyaoDePrueba(Formas),
    \+ yaku(riichi, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichiAbierto])),
    \+ yaku(dobleRiichi, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichiAbierto])).

test(ippatsu_aplica_con_riichiAbierto) :-
    manoTanyaoDePrueba(Formas),
    once(yaku(ippatsu, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichiAbierto, ippatsu]))).

test(riichiAbiertoRon_aplica_por_ron_con_la_regla) :-
    manoTanyaoDePrueba(Formas),
    once(yakuDeRegla(riichiAbiertoRonYakuman, riichiAbiertoRon, victoria(Formas, p5, ron),
        situacion(este, sur, [], [], [riichiAbierto]))).

test(riichiAbiertoRon_falla_por_tsumo) :-
    manoTanyaoDePrueba(Formas),
    \+ yakuDeRegla(_, _, victoria(Formas, p5, tsumo), situacion(este, sur, [], [], [riichiAbierto])).

test(riichiAbiertoRon_falla_sin_riichiAbierto) :-
    manoTanyaoDePrueba(Formas),
    \+ yakuDeRegla(_, _, victoria(Formas, p5, ron), situacion(este, sur, [], [], [riichi])).

:- end_tests(yakus).
