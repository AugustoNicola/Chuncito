% Tests de src/resultado.pl: el pipeline completo, de mano+situación a
% resultado final (yakus ordenados, han, fu, nivel y pago).

:- begin_tests(resultado).

sinFlags(situacion(este, sur, [], [], [])).

% ---- pagoTotal/2 ----

test(pago_total_ron) :- pagoTotal(pago(8000), 8000).
test(pago_total_tsumo_dealer) :- pagoTotal(pagoTsumoDealer(4000), 12000).
test(pago_total_tsumo_no_dealer) :- pagoTotal(pagoTsumo(2000, 4000), 8000).

% ---- yakusOrdenados/4: orden y dora ----

test(yakus_ordenados_respeta_el_orden_de_cliente) :-
    sinFlags(Situacion),
    once(yakusOrdenados([tanyao, pinfu, menzenTsumo],
        [pareja(m2,m2), escC(m3,m4,m5), escC(m3,m4,m5), escC(p3,p4,p5), escC(s3,s4,s5)],
        Situacion, Yakus)),
    Yakus == [yakuHan(menzenTsumo, 1), yakuHan(pinfu, 1), yakuHan(tanyao, 1)].

test(yakus_ordenados_agrega_dora_al_final) :-
    sinFlags(situacion(VR, VJ, _, _, F)),
    once(yakusOrdenados([tanyao],
        [pareja(m2,m2), triC(m5,m5,m5), escC(p3,p4,p5), escC(s3,s4,s5), escC(m6,m7,m8)],
        situacion(VR, VJ, [m5], [], F), Yakus)),
    % la pierna m5,m5,m5 coincide tres veces con la dora m5.
    Yakus == [yakuHan(tanyao, 1), yakuHan(dora, 3)].

test(yakus_ordenados_separa_dora_akadora_y_uradora) :-
    sinFlags(situacion(VR, VJ, _, _, F)),
    once(yakusOrdenados([tanyao],
        [pareja(m2,m2), triC(m5,m5R,m5), escC(p3,p4,p5), escC(s3,s4,s5), escC(m6,m7,m8)],
        situacion(VR, VJ, [m5], [m6], F), Yakus)),
    % dora: 3 (las tres m5 de la pierna coinciden con la dora m5)
    % akaDora: 1 (el m5R rojo de la pierna)
    % uraDora: 1 (el m6 de la escalera coincide con la ura dora m6)
    Yakus == [yakuHan(tanyao, 1), yakuHan(dora, 3), yakuHan(akaDora, 1), yakuHan(uraDora, 1)].

test(yakus_ordenados_sin_dora_no_agrega_yaku_dora) :-
    sinFlags(Situacion),
    once(yakusOrdenados([tanyao],
        [pareja(m2,m2), escC(m3,m4,m5), escC(p3,p4,p5), escC(s3,s4,s5), escC(m6,m7,m8)],
        Situacion, Yakus)),
    Yakus == [yakuHan(tanyao, 1)].

test(yakus_ordenados_yakuman_no_agrega_dora) :-
    sinFlags(situacion(VR, VJ, _, _, F)),
    once(yakusOrdenados([daisangen],
        [pareja(m2,m2), triC(r,r,r), triC(g,g,g), triC(wh,wh,wh), escC(s3,s4,s5)],
        situacion(VR, VJ, [r], [], F), Yakus)),
    Yakus == [yakuHan(daisangen, 13)].

% ---- resultadoDeVictoria/5: extremo a extremo ----

test(resultado_mano_normal_tanyao_pinfu) :-
    % Esta mano también forma sanshokuDoujun (3-4-5 en los tres palos),
    % además de pinfu y tanyao.
    sinFlags(Situacion),
    once(resultadoDeVictoria(
        mano([m2,m2,m3,m4,m5,p3,p4,p5,s3,s4,s5,m6,m7,m8], []),
        m5, ron, Situacion,
        resultado(Yakus, Han, Fu, Nivel, Pago))),
    Yakus == [yakuHan(pinfu, 1), yakuHan(tanyao, 1), yakuHan(sanshokuDoujun, 2)],
    Han == 4, Fu == 30, Nivel == sinNombre,
    Pago == pago(7700).

test(resultado_llega_a_una_mano_con_ankan) :-
    % Regresión: un kanC (ankan) declarado en la segunda lista de Mano
    % tiene que poder llegar hasta el resultado final (antes, solo se
    % aceptaban ahí juegos llamada/1, y kanC no lo es).
    sinFlags(Situacion),
    once(resultadoDeVictoria(
        mano([m2,m2,m3,m4,m5,p3,p4,p5,s3,s4,s5], [kanC(wh,wh,wh,wh)]),
        m3, ron, Situacion,
        resultado(Yakus, _, _, _, _))),
    memberchk(yakuHan(haku, 1), Yakus).

test(resultado_falla_sin_ningun_yaku) :-
    sinFlags(Situacion),
    \+ resultadoDeVictoria(
        mano([m1,m1,m2,m3,m4,p5,p6,p7,s2,s3,s4,n,n,n], []),
        m4, ron, Situacion,
        _).

test(resultado_elige_la_descomposicion_de_mayor_pago) :-
    % Las mismas 14 fichas admiten tanto una lectura chiitoitsu (2 han) como
    % lecturas estándar con ryanpeikou (3 han) + pinfu + tanyao: la segunda
    % da más puntos, así que resultadoDeVictoria/5 debe preferirla.
    sinFlags(Situacion),
    once(resultadoDeVictoria(
        mano([m2,m2,m3,m3,m4,m4,m5,m5,m6,m6,m7,m7,m8,m8], []),
        m2, ron, Situacion,
        resultado(Yakus, _, _, _, _))),
    \+ memberchk(yakuHan(chiitoitsu, _), Yakus).

% ---- riichiAbierto (open riichi) y reglas de la casa (resultadoDeVictoria/6) ----

% mano cuyo único yaku posible es el riichi que se declare: m1 impide
% tanyao y la espera kanchan (6-8 esperando 7) impide pinfu.
manoSoloRiichi(mano([m1,m1,m2,m3,m4,p2,p3,p4,s6,s7,s8,m6,m7,m8], [])).

test(resultado_riichi_abierto_vale_2_han) :-
    manoSoloRiichi(Mano),
    once(resultadoDeVictoria(Mano, m7, ron, situacion(este, sur, [], [], [riichiAbierto]),
        resultado(Yakus, Han, Fu, Nivel, Pago))),
    % 20 + 10 (menzen ron) + 2 (kanchan) = 32 -> 40 fu; 40 * 2^4 * 4 = 2560 -> 2600
    Yakus == [yakuHan(riichiAbierto, 2)],
    Han == 2, Fu == 40, Nivel == sinNombre,
    Pago == pago(2600).

test(resultado_riichi_abierto_dealer) :-
    manoSoloRiichi(Mano),
    once(resultadoDeVictoria(Mano, m7, ron, situacion(este, este, [], [], [riichiAbierto]),
        resultado(_, 2, 40, _, Pago))),
    % 40 * 2^4 * 6 = 3840 -> 3900
    Pago == pago(3900).

test(resultado_riichi_abierto_con_otros_yakus) :-
    once(resultadoDeVictoria(
        mano([m2,m2,m3,m4,p3,p4,p5,s3,s4,s5,m6,m7,m8,m5], []),
        m5, ron, situacion(este, sur, [], [], [riichiAbierto]),
        resultado(Yakus, Han, Fu, Nivel, Pago))),
    % riichiAbierto(2) + pinfu(1) + tanyao(1) + sanshokuDoujun(2) = 6 han
    Yakus == [yakuHan(riichiAbierto, 2), yakuHan(pinfu, 1), yakuHan(tanyao, 1), yakuHan(sanshokuDoujun, 2)],
    Han == 6, Fu == 30, Nivel == haneman,
    Pago == pago(12000).

test(resultado_riichi_abierto_con_ippatsu_y_ura_dora) :-
    manoSoloRiichi(Mano),
    once(resultadoDeVictoria(Mano, m7, ron, situacion(este, sur, [], [s7], [riichiAbierto, ippatsu]),
        resultado(Yakus, Han, _, _, _))),
    Yakus == [yakuHan(ippatsu, 1), yakuHan(riichiAbierto, 2), yakuHan(uraDora, 1)],
    Han == 4.

test(resultado_riichi_abierto_nunca_junto_a_riichi) :-
    manoSoloRiichi(Mano),
    once(resultadoDeVictoria(Mano, m7, ron, situacion(este, sur, [], [], [riichiAbierto]),
        resultado(Yakus, _, _, _, _))),
    \+ memberchk(yakuHan(riichi, _), Yakus),
    \+ memberchk(yakuHan(dobleRiichi, _), Yakus).

test(resultado_regla_hace_yakuman_el_ron_con_riichi_abierto) :-
    manoSoloRiichi(Mano),
    once(resultadoDeVictoria(Mano, m7, ron, situacion(este, sur, [m1], [s7], [riichiAbierto, ippatsu]),
        [riichiAbiertoRonYakuman],
        resultado(Yakus, Han, Fu, Nivel, Pago))),
    % como todo yakuman, anula ippatsu y la dora, y el fu queda en 0:
    Yakus == [yakuHan(riichiAbiertoRon, 13)],
    Han == 13, Fu == 0, Nivel == yakuman,
    Pago == pago(32000).

test(resultado_regla_yakuman_dealer) :-
    manoSoloRiichi(Mano),
    once(resultadoDeVictoria(Mano, m7, ron, situacion(este, este, [], [], [riichiAbierto]),
        [riichiAbiertoRonYakuman], resultado(_, _, _, yakuman, Pago))),
    Pago == pago(48000).

test(resultado_regla_yakuman_se_suma_a_otro_yakuman) :-
    % daisangen (cerrado, tanki en p5 para no formar suuAnkou) + riichiAbiertoRon:
    once(resultadoDeVictoria(
        mano([r,r,r,g,g,g,wh,wh,wh,m2,m3,m4,p5,p5], []),
        p5, ron, situacion(este, sur, [], [], [riichiAbierto]),
        [riichiAbiertoRonYakuman],
        resultado(Yakus, Han, Fu, Nivel, Pago))),
    Yakus == [yakuHan(daisangen, 13), yakuHan(riichiAbiertoRon, 13)],
    Han == 26, Fu == 0, Nivel == dobleYakuman,
    Pago == pago(64000).

test(resultado_regla_no_afecta_al_tsumo) :-
    manoSoloRiichi(Mano),
    Sit = situacion(este, sur, [], [], [riichiAbierto]),
    once(resultadoDeVictoria(Mano, m7, tsumo, Sit, [riichiAbiertoRonYakuman], ConRegla)),
    once(resultadoDeVictoria(Mano, m7, tsumo, Sit, SinRegla)),
    ConRegla == SinRegla,
    % riichiAbierto(2) + menzenTsumo(1) = 3 han; 20 + 2 (tsumo) + 2 (kanchan) -> 30 fu
    ConRegla = resultado(Yakus, 3, 30, sinNombre, pagoTsumo(1000, 2000)),
    Yakus == [yakuHan(menzenTsumo, 1), yakuHan(riichiAbierto, 2)].

test(resultado_regla_sin_riichi_abierto_no_hace_nada) :-
    manoSoloRiichi(Mano),
    Sit = situacion(este, sur, [], [], [riichi]),
    once(resultadoDeVictoria(Mano, m7, ron, Sit, [riichiAbiertoRonYakuman], ConRegla)),
    once(resultadoDeVictoria(Mano, m7, ron, Sit, SinRegla)),
    ConRegla == SinRegla.

test(resultado_5_equivale_a_6_sin_reglas) :-
    Mano = mano([m2,m2,m3,m4,p3,p4,p5,s3,s4,s5,m6,m7,m8,m5], []),
    Sit = situacion(este, sur, [m2], [s4], [riichi, ippatsu]),
    once(resultadoDeVictoria(Mano, m5, ron, Sit, R5)),
    once(resultadoDeVictoria(Mano, m5, ron, Sit, [], R6)),
    R5 == R6,
    % riichi + ippatsu + pinfu + tanyao + sanshokuDoujun(2) + 2 dora (el par m2) + 1 ura dora = 9 han
    R5 = resultado(_, 9, 30, baiman, pago(16000)).

test(resultado_falla_con_regla_desconocida) :-
    manoSoloRiichi(Mano),
    \+ resultadoDeVictoria(Mano, m7, ron, situacion(este, sur, [], [], [riichiAbierto]),
        [riichiAbiertoRonYakuman, reglaInventada], _).

:- end_tests(resultado).
