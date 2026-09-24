% Matriz de ejemplos de puntuación: una mano real por cada combinación de
% han/fu (o nivel) que interesa cubrir como regresión, usando puntuacion/6
% de punta a punta (Formas -> yakusAplicables/3 -> puntuacion/6), igual que
% los tests de integración de puntuacion_tests.pl. El objetivo no es
% reproducir la tabla oficial de puntajes (fu/han admisibles varían según
% reglamento), sino fijar, con manos concretas, el comportamiento real del
% código para la mayor variedad posible de combinaciones.

:- begin_tests(puntuacion_matriz).

sinFlags(situacion(este, sur, [], [], [])).
sitDealer(situacion(este, este, [], [], [])).

% ===================== Escalera de Fu (a 1 yaku, salvo aclaración) =====================
%* Todas usan haku (dragón blanco) como único yaku estructural cuando es
%* posible, variando par/piernas/espera/modo de victoria para recorrer
%* fu = 20, 30, 40, 50, 60, 70, 80, 90, 100 y 110.

test(fu_30_pinfu_abierto_kuipinfu_no_es_20) :-
    % "Open pinfu" / kuipinfu: la forma es de pinfu (solo secuencias, par
    % sin valor, espera ryanmen) pero la mano está abierta (chii), así que
    % pinfu deja de ser yaku (solo queda tanyao) y, sin la regla especial,
    % la composición daría 0 fu además de los 20 base (ver formaDePinfu/3
    % en yakus.pl y el comentario de fu/7 en puntuacion.pl). En vez de
    % quedar en 20 fu, la regla especial fuerza 30 (+2 fu fijos para
    % redondear), que es además el mínimo real de fu para una mano válida.
    Formas = [pareja(m5,m5), chii(p2,p3,p4), escC(s5,s6,s7), escC(m6,m7,m8), escC(m2,m3,m4)],
    Sit = situacion(este, sur, [], [], []),
    once(yakusAplicables(victoria(Formas, m6, ron), Sit, Yakus)),
    Yakus == [tanyao],
    once(puntuacion(Formas, m6, ron, Yakus, Sit, puntuacion(1, 30, sinNombre, pago(1000)))).

test(fu_30_pinfu_abierto_por_tsumo_tambien_da_30) :-
    % Mismo caso pero por tsumo: sin la regla especial daría 20+2(tsumo)=22
    % -> 30 igual, así que la regla especial no cambia el resultado acá,
    % pero formaDePinfu/3 la sigue cubriendo por consistencia (ver fu/7).
    Formas = [pareja(m5,m5), chii(p2,p3,p4), escC(s5,s6,s7), escC(m6,m7,m8), escC(m2,m3,m4)],
    Sit = situacion(este, sur, [], [], []),
    once(yakusAplicables(victoria(Formas, m6, tsumo), Sit, Yakus)),
    Yakus == [tanyao],
    once(puntuacion(Formas, m6, tsumo, Yakus, Sit, puntuacion(1, 30, sinNombre, pagoTsumo(300, 500)))).

test(fu_30_abierto_haku_ryanmen_tsumo) :-
    % haku por pon (abierto), tsumo: 20 base + 4 (haku abierto) + 0 espera + 2 tsumo.
    Formas = [pareja(m5,m5), pon(wh,wh,wh), escC(s2,s3,s4), escC(p6,p7,p8), escC(m2,m3,m4)],
    Sit = situacion(este, sur, [], [], []),
    once(yakusAplicables(victoria(Formas, m2, tsumo), Sit, Yakus)),
    once(puntuacion(Formas, m2, tsumo, Yakus, Sit, puntuacion(1, 30, sinNombre, pagoTsumo(300, 500)))).

test(fu_40_haku_cerrado_ryanmen_ron) :-
    % haku cerrado (triC), ron con mano cerrada: 20 + 8 (haku cerrado) + 0 espera + 10 menzen ron.
    Formas = [pareja(m5,m5), triC(wh,wh,wh), escC(s2,s3,s4), escC(p6,p7,p8), escC(m2,m3,m4)],
    Sit = situacion(este, sur, [], [], []),
    once(yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus)),
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(1, 40, sinNombre, pago(1300)))).

test(fu_50_haku_mas_tripla_simple_kanchan_ron) :-
    % + una tripla simple cerrada (4) y espera kanchan (2).
    Formas = [pareja(m5,m5), triC(wh,wh,wh), triC(m2,m2,m2), escC(p2,p3,p4), escC(s6,s7,s8)],
    Sit = situacion(este, sur, [], [], []),
    once(yakusAplicables(victoria(Formas, p3, ron), Sit, Yakus)),
    once(puntuacion(Formas, p3, ron, Yakus, Sit, puntuacion(1, 50, sinNombre, pago(1600)))).

test(fu_60_par_de_viento_doble_mas_tripla_terminal_kanchan_ron) :-
    % repartidor: el par de "e" es viento de ronda y de jugador (+4).
    % + una tripla terminal cerrada (8) y espera kanchan (2).
    Formas = [pareja(e,e), triC(wh,wh,wh), triC(p9,p9,p9), escC(m2,m3,m4), escC(s2,s3,s4)],
    sitDealer(Sit),
    once(yakusAplicables(victoria(Formas, m3, ron), Sit, Yakus)),
    once(puntuacion(Formas, m3, ron, Yakus, Sit, puntuacion(1, 60, sinNombre, pago(2900)))).

test(fu_70_haku_mas_kan_abierto_y_kan_cerrado_kanchan_tsumo) :-
    % Un kan SIEMPRE está completo antes de ganar (se declara aparte, ya
    % sea ankan o robando/completando un pon; nunca se termina de formar
    % con la ficha ganadora, ni por ron ni por tsumo: ver el comentario de
    % piernasOcultasParaAnkou/4 en yakus.pl y de fuIntento/6 en
    % puntuacion.pl, que excluyen a los quads como candidatos). Para sumar
    % fu con un quad sin caer en esa trampa, se llama un kan abierto de
    % verdad (kanA): al ser una llamada real, tampoco cuenta como pierna
    % oculta para sanAnkou. repartidor: par de viento doble (+4).
    Formas = [pareja(e,e), triC(wh,wh,wh), kanA(p9,p9,p9,p9), kanC(m2,m2,m2,m2), escC(s2,s3,s4)],
    sitDealer(Sit),
    once(yakusAplicables(victoria(Formas, s3, tsumo), Sit, Yakus)),
    once(puntuacion(Formas, s3, tsumo, Yakus, Sit, puntuacion(1, 70, sinNombre, pagoTsumoDealer(1200)))).

test(fu_80_haku_mas_quad_terminal_kanchan_ron) :-
    Formas = [pareja(e,e), triC(wh,wh,wh), kanC(p9,p9,p9,p9), escC(m2,m3,m4), escC(s2,s3,s4)],
    sitDealer(Sit),
    once(yakusAplicables(victoria(Formas, s3, ron), Sit, Yakus)),
    once(puntuacion(Formas, s3, ron, Yakus, Sit, puntuacion(1, 80, sinNombre, pago(3900)))).

test(fu_90_haku_mas_kan_abierto_y_kan_cerrado_terminales_tsumo) :-
    % Mismo mecanismo que fu_70 (kanA real en vez de intentar "abrir" un
    % kan con la ficha ganadora), con dos quads terminales para llegar a 90.
    Formas = [pareja(e,e), triC(wh,wh,wh), kanA(p9,p9,p9,p9), kanC(s9,s9,s9,s9), escC(m2,m3,m4)],
    sitDealer(Sit),
    once(yakusAplicables(victoria(Formas, m2, tsumo), Sit, Yakus)),
    once(puntuacion(Formas, m2, tsumo, Yakus, Sit, puntuacion(1, 90, sinNombre, pagoTsumoDealer(1500)))).

test(fu_100_tres_piernas_terminales_ocultas_da_tambien_sanAnkou) :-
    % A diferencia de fu_70/fu_90, acá la ficha ganadora (kanchan en la
    % escalera) no coincide con ninguna pierna, así que la única
    % asignación posible dentro de piernasOcultasParaAnkou/4 deja las tres
    % piernas ocultas: sanAnkou aplica también, sin poder evitarlo (así
    % ganaría realmente esta mano). A partir de han=3 con este fu, la
    % fórmula ya satura en mangan (ver basePuntos/4), por eso el pago
    % coincide con el de fu_110.
    Formas = [pareja(e,e), triC(wh,wh,wh), kanC(p9,p9,p9,p9), kanC(m2,m2,m2,m2), escC(s2,s3,s4)],
    sitDealer(Sit),
    once(yakusAplicables(victoria(Formas, s3, ron), Sit, Yakus)),
    Yakus == [haku, sanAnkou],
    once(puntuacion(Formas, s3, ron, Yakus, Sit, puntuacion(3, 100, sinNombre, pago(12000)))).

test(fu_110_tres_piernas_terminales_ocultas_da_tambien_sanAnkou) :-
    Formas = [pareja(e,e), triC(wh,wh,wh), kanC(p9,p9,p9,p9), kanC(m9,m9,m9,m9), escC(s2,s3,s4)],
    sitDealer(Sit),
    once(yakusAplicables(victoria(Formas, s3, ron), Sit, Yakus)),
    Yakus == [haku, sanAnkou],
    once(puntuacion(Formas, s3, ron, Yakus, Sit, puntuacion(3, 110, sinNombre, pago(12000)))).

% ===================== Escalera de Han (a 30 fu, apilando yakus/dora) =====================
%* Mismo esqueleto de mano (pinfu + tanyao) en las cinco, sumando riichi,
%* ippatsu y dora para recorrer cada escalón de han/nivel.

manoEscaleraHanDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(p6, p7, p8), escC(s2, s3, s4), escC(s6, s7, s8)
]).

test(han_2_pinfu_tanyao_ron) :-
    manoEscaleraHanDePrueba(Formas),
    Sit = situacion(este, sur, [], [], []),
    once(yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus)),
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(2, 30, sinNombre, pago(2000)))).

test(han_3_mas_riichi) :-
    manoEscaleraHanDePrueba(Formas),
    Sit = situacion(este, sur, [], [], [riichi]),
    once(yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus)),
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(3, 30, sinNombre, pago(3900)))).

test(han_4_mas_ippatsu) :-
    manoEscaleraHanDePrueba(Formas),
    Sit = situacion(este, sur, [], [], [riichi, ippatsu]),
    once(yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus)),
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(4, 30, sinNombre, pago(7700)))).

test(han_5_mangan_mas_una_dora) :-
    manoEscaleraHanDePrueba(Formas),
    Sit = situacion(este, sur, [m2], [], [riichi, ippatsu]),
    once(yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus)),
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(5, 30, mangan, pago(8000)))).

test(han_6_haneman_mas_dos_doras) :-
    manoEscaleraHanDePrueba(Formas),
    Sit = situacion(este, sur, [m2, m2], [], [riichi, ippatsu]),
    once(yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus)),
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(6, 30, haneman, pago(12000)))).

test(han_8_baiman_mas_cuatro_doras) :-
    manoEscaleraHanDePrueba(Formas),
    Sit = situacion(este, sur, [m2, m2, m2, m2], [], [riichi, ippatsu]),
    once(yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus)),
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(8, 30, baiman, pago(16000)))).

test(han_11_sanbaiman_mas_siete_doras) :-
    manoEscaleraHanDePrueba(Formas),
    Sit = situacion(este, sur, [m2, m2, m2, m2, m2, m2, m2], [], [riichi, ippatsu]),
    once(yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus)),
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(11, 30, sanbaiman, pago(24000)))).

test(han_13_kazoeYakuman_mas_nueve_doras) :-
    % Suma 13 han sin ningún yakuman real: se puntúa como kazoeYakuman
    % (ver nivelDePuntuacion/3), no como yakuman.
    manoEscaleraHanDePrueba(Formas),
    Sit = situacion(este, sur, [m2, m2, m2, m2, m2, m2, m2, m2, m2], [], [riichi, ippatsu]),
    once(yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus)),
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(13, 30, kazoeYakuman, pago(32000)))).

% ===================== Escalera de Chiitoitsu (siempre a 25 fu) =====================

test(chiitoitsu_2_han_solo) :-
    Formas = [
        pareja(m1, m1), pareja(m4, m4), pareja(p2, p2), pareja(p5, p5),
        pareja(s3, s3), pareja(s7, s7), pareja(n, n)
    ],
    Sit = situacion(este, sur, [], [], []),
    once(yakusAplicables(victoria(Formas, m1, ron), Sit, Yakus)),
    once(puntuacion(Formas, m1, ron, Yakus, Sit, puntuacion(2, 25, sinNombre, pago(1600)))).

test(chiitoitsu_3_han_mas_tanyao) :-
    Formas = [
        pareja(m2, m2), pareja(m4, m4), pareja(p2, p2), pareja(p5, p5),
        pareja(s3, s3), pareja(s7, s7), pareja(s8, s8)
    ],
    Sit = situacion(este, sur, [], [], []),
    once(yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus)),
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(3, 25, sinNombre, pago(3200)))).

test(chiitoitsu_5_han_mangan_mas_honitsu) :-
    % chiitoitsu (2) + honitsu cerrado (3, un solo palo más honores) = 5 -> mangan.
    Formas = [
        pareja(m1, m1), pareja(m4, m4), pareja(m2, m2), pareja(m5, m5),
        pareja(m3, m3), pareja(m7, m7), pareja(n, n)
    ],
    Sit = situacion(este, sur, [], [], []),
    once(yakusAplicables(victoria(Formas, m1, ron), Sit, Yakus)),
    once(puntuacion(Formas, m1, ron, Yakus, Sit, puntuacion(5, 25, mangan, pago(8000)))).

% ===================== Yakuman: múltiples a la vez =====================

test(yakuman_doble_suuAnkou_y_chinroutou_a_la_vez) :-
    % Cuatro triplas ocultas de fichas terminales (1 y 9) más un par
    % terminal: suuAnkou (yakuman) y chinroutou (yakuman) aplican a la vez.
    % Gana por tsumo en m1 (espera shanpon): con s9, el par, sería tanki
    % (suuAnkouTanki, doble), y la mano sería triple yakuman.
    Formas = [pareja(s9,s9), triC(m1,m1,m1), triC(m9,m9,m9), triC(p1,p1,p1), triC(p9,p9,p9)],
    Sit = situacion(este, sur, [], [], []),
    once(yakusAplicables(victoria(Formas, m1, tsumo), Sit, Yakus)),
    Yakus == [chinroutou, suuAnkou],
    once(puntuacion(Formas, m1, tsumo, Yakus, Sit, puntuacion(26, 0, dobleYakuman, pagoTsumo(16000, 32000)))).

% ===================== Desglose de fu (puntuacion/7) =====================
%* Las mismas manos de la escalera de fu, pidiendo además el desglose: en
%* cada una, las partes suman exactamente el Fu (ya redondeado; el
%* redondeo es su propia parte) y describen la interpretación elegida.

%! desgloseDeFu(+Formas, +Ganadora, +Modo, +Sit, -Fu, -Desglose) is semidet.
%* Puntúa por puntuacion/7 y corrobora que la suma de Desglose sea Fu.
desgloseDeFu(Formas, Ganadora, Modo, Sit, Fu, Desglose) :-
    once(yakusAplicables(victoria(Formas, Ganadora, Modo), Sit, Yakus)),
    once(puntuacion(Formas, Ganadora, Modo, Yakus, Sit, puntuacion(_, Fu, _, _), Desglose)),
    findall(F, member(fuParte(_, F), Desglose), Fus),
    sum_list(Fus, Fu).

test(desglose_fu_30_pinfu_abierto_ron) :-
    desgloseDeFu([pareja(m5,m5), chii(p2,p3,p4), escC(s5,s6,s7), escC(m6,m7,m8), escC(m2,m3,m4)],
        m6, ron, situacion(este, sur, [], [], []), 30, D),
    D == [fuParte(fuBase, 20), fuParte(pinfuAbierto, 2), fuParte(redondeo, 8)].

test(desglose_fu_30_pinfu_abierto_tsumo) :-
    % mismo desglose: los +2 fijos reemplazan al fu de tsumo (ver fu/7).
    desgloseDeFu([pareja(m5,m5), chii(p2,p3,p4), escC(s5,s6,s7), escC(m6,m7,m8), escC(m2,m3,m4)],
        m6, tsumo, situacion(este, sur, [], [], []), 30, D),
    D == [fuParte(fuBase, 20), fuParte(pinfuAbierto, 2), fuParte(redondeo, 8)].

test(desglose_fu_30_abierto_haku_ryanmen_tsumo) :-
    desgloseDeFu([pareja(m5,m5), pon(wh,wh,wh), escC(s2,s3,s4), escC(p6,p7,p8), escC(m2,m3,m4)],
        m2, tsumo, situacion(este, sur, [], [], []), 30, D),
    D == [fuParte(fuBase, 20), fuParte(tsumo, 2), fuParte(juego(pon(wh,wh,wh)), 4), fuParte(redondeo, 4)].

test(desglose_fu_40_haku_cerrado_ryanmen_ron) :-
    desgloseDeFu([pareja(m5,m5), triC(wh,wh,wh), escC(s2,s3,s4), escC(p6,p7,p8), escC(m2,m3,m4)],
        m2, ron, situacion(este, sur, [], [], []), 40, D),
    D == [fuParte(fuBase, 20), fuParte(menzenRon, 10), fuParte(juego(triC(wh,wh,wh)), 8), fuParte(redondeo, 2)].

test(desglose_fu_50_haku_mas_tripla_simple_kanchan_ron) :-
    desgloseDeFu([pareja(m5,m5), triC(wh,wh,wh), triC(m2,m2,m2), escC(p2,p3,p4), escC(s6,s7,s8)],
        p3, ron, situacion(este, sur, [], [], []), 50, D),
    D == [fuParte(fuBase, 20), fuParte(menzenRon, 10), fuParte(juego(triC(wh,wh,wh)), 8),
          fuParte(juego(triC(m2,m2,m2)), 4), fuParte(espera(kanchan), 2), fuParte(redondeo, 6)].

test(desglose_fu_60_par_de_viento_doble) :-
    sitDealer(Sit),
    desgloseDeFu([pareja(e,e), triC(wh,wh,wh), triC(p9,p9,p9), escC(m2,m3,m4), escC(s2,s3,s4)],
        m3, ron, Sit, 60, D),
    D == [fuParte(fuBase, 20), fuParte(menzenRon, 10), fuParte(juego(triC(wh,wh,wh)), 8),
          fuParte(juego(triC(p9,p9,p9)), 8), fuParte(par(e), 4), fuParte(espera(kanchan), 2),
          fuParte(redondeo, 8)].

test(desglose_fu_70_kan_abierto_y_kan_cerrado_tsumo) :-
    sitDealer(Sit),
    desgloseDeFu([pareja(e,e), triC(wh,wh,wh), kanA(p9,p9,p9,p9), kanC(m2,m2,m2,m2), escC(s2,s3,s4)],
        s3, tsumo, Sit, 70, D),
    D == [fuParte(fuBase, 20), fuParte(tsumo, 2), fuParte(juego(triC(wh,wh,wh)), 8),
          fuParte(juego(kanA(p9,p9,p9,p9)), 16), fuParte(juego(kanC(m2,m2,m2,m2)), 16),
          fuParte(par(e), 4), fuParte(espera(kanchan), 2), fuParte(redondeo, 2)].

test(desglose_fu_80_quad_terminal_cerrado) :-
    sitDealer(Sit),
    desgloseDeFu([pareja(e,e), triC(wh,wh,wh), kanC(p9,p9,p9,p9), escC(m2,m3,m4), escC(s2,s3,s4)],
        s3, ron, Sit, 80, D),
    D == [fuParte(fuBase, 20), fuParte(menzenRon, 10), fuParte(juego(triC(wh,wh,wh)), 8),
          fuParte(juego(kanC(p9,p9,p9,p9)), 32), fuParte(par(e), 4), fuParte(espera(kanchan), 2),
          fuParte(redondeo, 4)].

test(desglose_fu_90_sin_parte_de_espera_ryanmen) :-
    % ryanmen en m2-m3-m4: la espera no suma y no se lista.
    sitDealer(Sit),
    desgloseDeFu([pareja(e,e), triC(wh,wh,wh), kanA(p9,p9,p9,p9), kanC(s9,s9,s9,s9), escC(m2,m3,m4)],
        m2, tsumo, Sit, 90, D),
    D == [fuParte(fuBase, 20), fuParte(tsumo, 2), fuParte(juego(triC(wh,wh,wh)), 8),
          fuParte(juego(kanA(p9,p9,p9,p9)), 16), fuParte(juego(kanC(s9,s9,s9,s9)), 32),
          fuParte(par(e), 4), fuParte(redondeo, 8)].

test(desglose_fu_100_y_110) :-
    sitDealer(Sit),
    desgloseDeFu([pareja(e,e), triC(wh,wh,wh), kanC(p9,p9,p9,p9), kanC(m2,m2,m2,m2), escC(s2,s3,s4)],
        s3, ron, Sit, 100, D100),
    last(D100, fuParte(redondeo, 8)),
    desgloseDeFu([pareja(e,e), triC(wh,wh,wh), kanC(p9,p9,p9,p9), kanC(m9,m9,m9,m9), escC(s2,s3,s4)],
        s3, ron, Sit, 110, D110),
    last(D110, fuParte(redondeo, 2)).

test(desglose_escalera_de_han_pinfu_ron_sin_redondeo) :-
    % 20 + 10 = 30 exacto: no hay parte de redondeo.
    manoEscaleraHanDePrueba(Formas),
    desgloseDeFu(Formas, m2, ron, situacion(este, sur, [m2], [], [riichi, ippatsu]), 30, D),
    D == [fuParte(fuBase, 20), fuParte(menzenRon, 10)].

test(desglose_chiitoitsu_25_fijo) :-
    desgloseDeFu([pareja(m1, m1), pareja(m4, m4), pareja(p2, p2), pareja(p5, p5),
                  pareja(s3, s3), pareja(s7, s7), pareja(n, n)],
        m1, ron, situacion(este, sur, [], [], []), 25, D),
    D == [fuParte(chiitoitsu, 25)].

test(desglose_yakuman_vacio) :-
    Formas = [pareja(s9,s9), triC(m1,m1,m1), triC(m9,m9,m9), triC(p1,p1,p1), triC(p9,p9,p9)],
    desgloseDeFu(Formas, m1, tsumo, situacion(este, sur, [], [], []), 0, D),
    D == [].

% ===================== Dobles yakuman =====================

test(yakuman_triple_suuAnkouTanki_y_chinroutou) :-
    % la misma mano de yakuman_doble_suuAnkou_y_chinroutou_a_la_vez, pero
    % ganada en el par (tanki): suuAnkouTanki (26) + chinroutou (13).
    Formas = [pareja(s9,s9), triC(m1,m1,m1), triC(m9,m9,m9), triC(p1,p1,p1), triC(p9,p9,p9)],
    Sit = situacion(este, sur, [], [], []),
    once(yakusAplicables(victoria(Formas, s9, tsumo), Sit, Yakus)),
    Yakus == [chinroutou, suuAnkouTanki],
    once(puntuacion(Formas, s9, tsumo, Yakus, Sit, puntuacion(39, 0, tripleYakuman, pagoTsumo(24000, 48000)))).

:- end_tests(puntuacion_matriz).
