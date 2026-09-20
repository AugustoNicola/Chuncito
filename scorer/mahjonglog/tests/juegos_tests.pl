% Tests de src/juegos.pl: relaciones entre fichas (pares, triplas, escaleras)
% y combinacion/4.

:- begin_tests(juegos_pares_triplas).

test(par_usa_igualdad) :- fichasDePareja(m2, m2).
test(par_con_redfive) :- once(fichasDePareja(s5, s5R)).
test(tripla_todas_iguales) :- once(fichasDeTripla(p7, p7, p7)).
test(tripla_falla_si_no_coincide) :- \+ fichasDeTripla(p7, p7, p8).

:- end_tests(juegos_pares_triplas).

% ===================== grupos numéricos y escaleras =====================

:- begin_tests(grupos_numericos).

test(mismo_palo_verdadero) :- mismoPalo(m1, m2, m3).
test(mismo_palo_falso) :- \+ mismoPalo(m1, p2, s3).

test(max3_basico) :- max3(1, 5, 3, 5).
test(min3_basico) :- min3(1, 5, 3, 1).

test(max_numero_entre) :- maxNumeroEntre(m1, m5, m3, 5).
test(min_numero_entre) :- minNumeroEntre(m1, m5, m3, 1).

test(sin_numeros_repetidos_verdadero) :- sinNumerosRepetidos(m1, m2, m3).
test(sin_numeros_repetidos_falso_si_hay_repeticion) :- \+ sinNumerosRepetidos(m1, m1, m2).

test(numeros_en_escalera_verdadero) :- numerosEnEscalera(m1, m2, m3).
test(numeros_en_escalera_falso_si_no_consecutivos) :- \+ numerosEnEscalera(m1, m2, m4).

:- end_tests(grupos_numericos).

:- begin_tests(escaleras).

test(escalera_ordenada) :- fichasDeEscalera(m1, m2, m3).
test(escalera_desordenada) :- fichasDeEscalera(m3, m1, m2).
test(escalera_con_redfive) :- fichasDeEscalera(m5R, m6, m7).
test(escalera_falla_con_hueco) :- \+ fichasDeEscalera(m1, m2, m4).
test(escalera_falla_con_distinto_palo) :- \+ fichasDeEscalera(m1, p2, s3).

:- end_tests(escaleras).

% ===================== combinaciones =====================

:- begin_tests(combinaciones).

test(combinacion_todas, all(Elegidos-Resto == [
        [1,2]-[3], [1,3]-[2], [2,3]-[1]
    ])) :-
    combinacion(2, [1,2,3], Elegidos, Resto).

test(combinacion_cero) :- once(combinacion(0, [1,2,3], [], [1,2,3])).
test(combinacion_completa) :- once(combinacion(3, [1,2,3], [1,2,3], [])).
test(combinacion_conserva_repetidos, all(Elegidos == [[m1,m1], [m1,m2], [m1,m2]])) :-
    combinacion(2, [m1, m1, m2], Elegidos, _).

test(combinacionUnica_filtra_repetidos_por_valor, all(Elegidos == [[m1,m1], [m1,m2]])) :-
    combinacionUnica(2, [m1, m1, m2], Elegidos, _).

test(combinacionUnica_con_dos_pares_repetidos, all(Elegidos-Resto == [
        [m4,m4]-[m5,m5], [m4,m5]-[m4,m5], [m5,m5]-[m4,m4]
    ])) :-
    combinacionUnica(2, [m4, m4, m5, m5], Elegidos, Resto).

:- end_tests(combinaciones).
