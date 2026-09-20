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

:- end_tests(resultado).
