% Tests de src/puntuacion.pl: han, fu y pago final de una victoria.

:- begin_tests(puntuacion).

sinFlags(situacion(este, sur, [], [], [])).

% ---- hanYaku / hanDeYaku ----

test(hanDeYaku_cerrada_kuisagari) :- once(hanDeYaku(sanshokuDoujun, true, 2)).
test(hanDeYaku_abierta_kuisagari) :- once(hanDeYaku(sanshokuDoujun, false, 1)).
test(hanDeYaku_sin_kuisagari_igual_abierta_o_cerrada) :-
    once(hanDeYaku(toitoi, true, H)), once(hanDeYaku(toitoi, false, H)).

test(hanYakusRegulares_suma_varios_yakus) :-
    hanYakusRegulares([tanyao, pinfu, riichi], true, 3).

test(hanYakusRegulares_ignora_yakuman) :-
    % daisangen es yakuman: no debe sumarse acá (se puntúa aparte).
    hanYakusRegulares([tanyao, daisangen], true, 1).

% ---- contarDoras ----

manoParaDoraDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(p2, p3, p4), triC(s5, s5, s5), escC(s6, s7, s8)
]).

manoParaAkaDoraDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(p2, p3, p4), triC(s5R, s5R, s5R), escC(s6, s7, s8)
]).

test(contarDoras_sin_coincidencias) :-
    manoParaDoraDePrueba(Formas),
    contarDoras(Formas, situacion(este, sur, [n], [], []), 0).

test(contarDoras_una_coincidencia_de_dora) :-
    % el par de p5 son dos fichas iguales a la dora:
    manoParaDoraDePrueba(Formas),
    contarDoras(Formas, situacion(este, sur, [p5], [], []), 2).

test(contarDoras_cuenta_ura_dora_por_separado) :-
    manoParaDoraDePrueba(Formas),
    contarDoras(Formas, situacion(este, sur, [p5], [m2], []), 3).

test(contarDoras_cuenta_red_five_como_aka_dora) :-
    % triC(s5R,s5R,s5R) son tres red fives, cada uno suma 1 aparte de dora:
    manoParaAkaDoraDePrueba(Formas),
    contarDoras(Formas, situacion(este, sur, [], [], []), 3).

test(contarDoras_dos_indicadores_al_mismo_valor_cuentan_multiplicado) :-
    % dos indicadores de dora apuntando a p5 (dos entradas iguales en
    % Doras) sobre un par de p5: 2 fichas x 2 indicadores = 4 han.
    manoParaDoraDePrueba(Formas),
    contarDoras(Formas, situacion(este, sur, [p5, p5], [], []), 4).

% ---- fu: casos fijos ----

manoPinfuDePrueba([
    pareja(p5, p5), escC(m2, m3, m4), escC(p6, p7, p8), escC(s2, s3, s4), escC(s7, s8, s9)
]).

test(fu_chiitoitsu_es_25_fijo) :-
    fu([pareja(m1,m1)], m1, ron, true, [chiitoitsu], sinFlags_dummy, 25).

test(fu_pinfu_tsumo_es_20_fijo) :-
    manoPinfuDePrueba(Formas), sinFlags(Sit),
    fu(Formas, m2, tsumo, true, [pinfu], Sit, 20).

test(fu_pinfu_ron_es_30) :-
    % 20 base + 10 de menzen ron, 0 de espera (ryanmen) y 0 de par/piernas:
    manoPinfuDePrueba(Formas), sinFlags(Sit),
    fu(Formas, m2, ron, true, [pinfu], Sit, 30).

% ---- fu: piernas (ankou/minko, simple/terminal-honor, tripla/quad) ----

manoConPiernasDePrueba([
    pareja(p5, p5), triC(m2, m2, m2), pon(p9, p9, p9), kanC(s1, s1, s1, s1), escC(s6, s7, s8)
]).

test(fu_pierna_oculta_simple_suma_4) :-
    % triC(m2,m2,m2): tripla oculta, simple -> 2*2*1 = 4
    manoConPiernasDePrueba(Formas), sinFlags(Sit),
    fu(Formas, s6, ron, false, [], Sit, FuTotal),
    % 20 base + 4 (triC simple) + 4 (pon p9 terminal abierta: 2*1*2) +
    % 32 (kanC s1 terminal cerrada: 8*2*2) + 0 escalera + 0 espera
    % (ryanmen en s6-s7-s8) + 0 menzen ron (mano abierta por el pon):
    FuTotal =:= 20 + 4 + 4 + 32 + 0 + 0 + 0.

test(fu_pierna_abierta_pesa_menos_que_oculta) :-
    fuJuego(triC(m2, m2, m2), ninguna, tsumo, FuOculta),
    fuJuego(pon(m2, m2, m2), ninguna, tsumo, FuAbierta),
    FuOculta =:= 4, FuAbierta =:= 2.

test(fu_quad_pesa_mas_que_tripla) :-
    fuJuego(triC(m2, m2, m2), ninguna, tsumo, FuTripla),
    fuJuego(kanC(m2, m2, m2, m2), ninguna, tsumo, FuQuad),
    FuQuad =:= FuTripla * 4.

test(fu_terminal_u_honor_duplica) :-
    fuJuego(triC(m2, m2, m2), ninguna, tsumo, FuSimple),
    fuJuego(triC(m1, m1, m1), ninguna, tsumo, FuTerminal),
    FuTerminal =:= FuSimple * 2.

% ---- fu: par (dragón / viento) ----

test(fuPar_dragon_suma_2) :-
    fuPar(pareja(r, r), situacion(este, sur, [], [], []), 2).

test(fuPar_viento_simple_suma_2) :-
    fuPar(pareja(s, s), situacion(este, sur, [], [], []), 2).

test(fuPar_viento_doble_suma_4) :-
    % jugador este en ronda este: el par de "e" es viento de ronda y de asiento.
    fuPar(pareja(e, e), situacion(este, este, [], [], []), 4).

test(fuPar_simple_no_suma) :-
    fuPar(pareja(p5, p5), situacion(este, sur, [], [], []), 0).

% ---- fu: espera ----

test(fuEspera_tanki_suma_2) :-
    fuEspera(pareja(p5, p5), pareja(p5, p5), p5, 2).

test(fuEspera_ryanmen_no_suma) :-
    fuEspera(escC(m2, m3, m4), pareja(p5, p5), m2, 0).

test(fuEspera_kanchan_suma_2) :-
    fuEspera(escC(m2, m3, m4), pareja(p5, p5), m3, 2).

test(fuEspera_pierna_no_suma) :-
    fuEspera(triC(m2, m2, m2), pareja(p5, p5), m2, 0).

% ---- ambigüedad: se toma la interpretación que da más fu ----

test(fu_toma_la_interpretacion_de_mayor_fu) :-
    % triC(p3,p3,p3) ya completa + escC(p2,p3,p4) completada por ron en p3:
    % conviene interpretar que el ron entró a la escalera (deja las tres
    % triplas cerradas) en vez de a la tripla (que la abriría).
    Formas = [pareja(m5, m5), triC(p3, p3, p3), triC(s1, s1, s1), triC(s9, s9, s9), escC(p2, p3, p4)],
    fu(Formas, p3, ron, true, [], situacion(este, sur, [], [], []), FuTotal),
    % 20 base + 4 (triC p3, simple, cerrada) + 8 + 8 (triC s1/s9, terminales,
    % cerradas) + 0 escalera + 2 (kanchan en la escalera) + 10 (menzen ron)
    % = 52 -> redondea a 60. La otra interpretación (el ron abre la tripla
    % de p3) da 48, menos que esta, así que no se elige:
    FuTotal =:= 60.

test(fuDesglosado_es_de_la_interpretacion_elegida) :-
    % mismo caso que fu_toma_la_interpretacion_de_mayor_fu: el desglose
    % tiene que describir la interpretación que da 60 (ron en la escalera,
    % kanchan; triC p3 cerrada), no la otra (ron en la tripla).
    Formas = [pareja(m5, m5), triC(p3, p3, p3), triC(s1, s1, s1), triC(s9, s9, s9), escC(p2, p3, p4)],
    fuDesglosado(Formas, p3, ron, true, [], situacion(este, sur, [], [], []), 60, Desglose),
    Desglose == [fuParte(fuBase, 20), fuParte(menzenRon, 10),
                 fuParte(juego(triC(p3, p3, p3)), 4), fuParte(juego(triC(s1, s1, s1)), 8),
                 fuParte(juego(triC(s9, s9, s9)), 8), fuParte(espera(kanchan), 2),
                 fuParte(redondeo, 8)].

test(fuDesglosado_tripla_completada_por_ron) :-
    % el ron en s7 (espera shanpon) abre la triC: se lista aparte.
    Formas = [pareja(p5, p5), triC(m2, m2, m2), triC(p3, p3, p3), triC(s7, s7, s7), pon(s4, s4, s4)],
    fuDesglosado(Formas, s7, ron, false, [], situacion(este, sur, [], [], []), 40, Desglose),
    Desglose == [fuParte(fuBase, 20),
                 fuParte(juego(triC(m2, m2, m2)), 4), fuParte(juego(triC(p3, p3, p3)), 4),
                 fuParte(juegoCompletadoPorRon(triC(s7, s7, s7)), 2), fuParte(juego(pon(s4, s4, s4)), 2),
                 fuParte(redondeo, 8)].

test(fuDesglosado_casos_fijos) :-
    manoPinfuDePrueba(Formas), sinFlags(Sit),
    fuDesglosado([pareja(m1,m1)], m1, ron, true, [chiitoitsu], Sit, 25, [fuParte(chiitoitsu, 25)]),
    fuDesglosado(Formas, m2, tsumo, true, [pinfu], Sit, 20, [fuParte(pinfuTsumo, 20)]),
    fuDesglosado(Formas, m2, ron, true, [pinfu], Sit, 30, [fuParte(fuBase, 20), fuParte(menzenRon, 10)]).

test(tipoDeEspera_nombres) :-
    tipoDeEspera(pareja(p5, p5), pareja(p5, p5), p5, tanki),
    tipoDeEspera(escC(m2, m3, m4), pareja(p5, p5), m2, ryanmen),
    tipoDeEspera(escC(m2, m3, m4), pareja(p5, p5), m3, kanchan),
    tipoDeEspera(escC(m1, m2, m3), pareja(p5, p5), m3, penchan),
    tipoDeEspera(escC(m7, m8, m9), pareja(p5, p5), m7, penchan),
    tipoDeEspera(triC(m2, m2, m2), pareja(p5, p5), m2, shanpon).

test(puntuacion_yakuman_desglose_vacio) :-
    Formas = [pareja(p5,p5), triC(m2,m2,m2), triC(p3,p3,p3), triC(s7,s7,s7), triC(s4,s4,s4)],
    Sit = situacion(este, sur, [], [], []),
    yakusAplicables(victoria(Formas, m2, tsumo), Sit, Yakus),
    once(puntuacion(Formas, m2, tsumo, Yakus, Sit, puntuacion(13, 0, yakuman, _), Desglose)),
    Desglose == [].

test(puntuacion_suuAnkouTanki_doble_yakuman_tsumo_no_dealer) :-
    Formas = [pareja(p5,p5), triC(m2,m2,m2), triC(p3,p3,p3), triC(s7,s7,s7), triC(s4,s4,s4)],
    Sit = situacion(este, sur, [], [], []),
    yakusAplicables(victoria(Formas, p5, tsumo), Sit, Yakus),
    Yakus == [suuAnkouTanki],
    once(puntuacion(Formas, p5, tsumo, Yakus, Sit, puntuacion(26, 0, dobleYakuman, pagoTsumo(16000, 32000)))).

% ---- nivelDePuntuacion / basePuntos ----

test(nivel_mangan_exacto) :- nivelDePuntuacion(5, 0, mangan).
test(nivel_haneman_6_han) :- nivelDePuntuacion(6, 0, haneman).
test(nivel_haneman_7_han) :- nivelDePuntuacion(7, 0, haneman).
test(nivel_baiman_8_han) :- nivelDePuntuacion(8, 0, baiman).
test(nivel_baiman_10_han) :- nivelDePuntuacion(10, 0, baiman).
test(nivel_sanbaiman_11_han) :- nivelDePuntuacion(11, 0, sanbaiman).
test(nivel_kazoeYakuman_13_han_sin_yakuman_real) :- nivelDePuntuacion(13, 0, kazoeYakuman).
test(nivel_kazoeYakuman_no_escala_con_mas_han) :- nivelDePuntuacion(20, 0, kazoeYakuman).
test(nivel_yakuman_real) :- once(nivelDePuntuacion(13, 1, yakuman)).
test(nivel_doble_yakuman) :- once(nivelDePuntuacion(26, 2, dobleYakuman)).
test(nivel_bajo_mangan_sin_nombre) :- nivelDePuntuacion(3, 0, sinNombre).

test(basePuntos_mangan_por_han_fijo) :- basePuntos(5, 30, 0, 2000).
test(basePuntos_mangan_por_fu_con_4han40fu) :- basePuntos(4, 40, 0, 2000).
test(basePuntos_no_llega_a_mangan_con_poco_fu) :- basePuntos(3, 30, 0, B), B < 2000.
test(basePuntos_yakuman_simple) :- basePuntos(13, 0, 1, 8000).
test(basePuntos_doble_yakuman) :- basePuntos(26, 0, 2, 16000).

% ---- puntosDeVictoria ----

test(puntos_ron_no_dealer_2han30fu) :-
    % valor de tabla conocido: 2000 puntos.
    once(puntosDeVictoria(false, ron, 2, 30, 0, pago(2000))).

test(puntos_ron_dealer_2han30fu) :-
    % el repartidor cobra 1.5x lo que un no-repartidor por ron.
    once(puntosDeVictoria(true, ron, 2, 30, 0, pago(2900))).

test(puntos_tsumo_no_dealer_mangan) :-
    % mangan tsumo no-repartidor: 2000/4000 (tabla conocida).
    puntosDeVictoria(false, tsumo, 5, 30, 0, pagoTsumo(2000, 4000)).

test(puntos_tsumo_dealer_mangan) :-
    % mangan tsumo repartidor: 4000 a cada rival (tabla conocida).
    puntosDeVictoria(true, tsumo, 5, 30, 0, pagoTsumoDealer(4000)).

test(puntos_ron_no_dealer_yakuman) :-
    once(puntosDeVictoria(false, ron, 13, 0, 1, pago(32000))).

test(puntos_ron_dealer_yakuman) :-
    once(puntosDeVictoria(true, ron, 13, 0, 1, pago(48000))).

% ---- puntuacion/6: integración ----

test(puntuacion_pinfu_riichi_ron_no_dealer) :-
    % 2han30fu ron no-dealer -> 2000 (tabla conocida).
    Formas = [pareja(p5,p5), escC(m2,m3,m4), escC(p6,p7,p8), escC(s2,s3,s4), escC(s7,s8,s9)],
    Sit = situacion(este, sur, [], [], [riichi]),
    yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus),
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(2, 30, sinNombre, pago(2000)))).

test(puntuacion_chinitsu_abierto_mangan_ron_no_dealer) :-
    Formas = [pareja(m1,m1), pon(m2,m2,m2), escC(m3,m4,m5), pon(m7,m7,m7), escC(m6,m7,m8)],
    Sit = situacion(este, sur, [], [], []),
    yakusAplicables(victoria(Formas, m1, ron), Sit, Yakus),
    once(puntuacion(Formas, m1, ron, Yakus, Sit, puntuacion(5, 30, mangan, pago(8000)))).

test(puntuacion_kokushi_tenhou_doble_yakuman_tsumo_dealer) :-
    % gana con m9 (kokushi simple); con el m1 repetido sería juusanmen.
    Forma = huerfanos(m1,m1,m9,p1,p9,s1,s9,e,s,w,n,wh,g,r),
    Sit = situacion(este, este, [], [], [primeraRonda]),
    yakusAplicables(victoria([Forma], m9, tsumo), Sit, Yakus),
    once(puntuacion([Forma], m9, tsumo, Yakus, Sit, puntuacion(26, 0, dobleYakuman, pagoTsumoDealer(32000)))).

test(puntuacion_suuAnkou_yakuman_tsumo_no_dealer) :-
    % tsumo en m2 (espera shanpon): suuAnkou simple. Con p5 (el par) sería
    % tanki, suuAnkouTanki, doble yakuman.
    Formas = [pareja(p5,p5), triC(m2,m2,m2), triC(p3,p3,p3), triC(s7,s7,s7), triC(s4,s4,s4)],
    Sit = situacion(este, sur, [], [], []),
    yakusAplicables(victoria(Formas, m2, tsumo), Sit, Yakus),
    once(puntuacion(Formas, m2, tsumo, Yakus, Sit, puntuacion(13, 0, yakuman, pagoTsumo(8000, 16000)))).

test(puntuacion_chiitoitsu_usa_25_fu) :-
    Formas = [
        pareja(m1, m1), pareja(m9, m9), pareja(p2, p2), pareja(p5, p5),
        pareja(s3, s3), pareja(s7, s7), pareja(n, n)
    ],
    Sit = situacion(este, sur, [], [], []),
    yakusAplicables(victoria(Formas, m1, tsumo), Sit, Yakus),
    puntuacion(Formas, m1, tsumo, Yakus, Sit, puntuacion(_, 25, _, _)).

test(puntuacion_incluye_dora_en_el_han) :-
    Formas = [pareja(p5,p5), escC(m2,m3,m4), escC(p6,p7,p8), escC(s2,s3,s4), escC(s7,s8,s9)],
    Sit = situacion(este, sur, [m2], [], [riichi]),
    yakusAplicables(victoria(Formas, m2, ron), Sit, Yakus),
    % pinfu(1) + riichi(1) + 1 dora (m2) = 3 han:
    once(puntuacion(Formas, m2, ron, Yakus, Sit, puntuacion(3, _, _, _))).

:- end_tests(puntuacion).
