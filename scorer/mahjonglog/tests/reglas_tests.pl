% Tests de src/reglas.pl: reglas de la casa opcionales.

:- begin_tests(reglas).

test(regla_soportada, all(R == [riichiAbiertoRonYakuman])) :- reglaSoportada(R).

test(reglas_validas_sin_reglas) :- reglasValidas([]).
test(reglas_validas_con_regla_conocida) :- reglasValidas([riichiAbiertoRonYakuman]).
test(reglas_invalidas_con_regla_desconocida) :-
    \+ reglasValidas([riichiAbiertoRonYakuman, otra]).
test(reglas_invalidas_si_no_es_lista) :- \+ reglasValidas(riichiAbiertoRonYakuman).

:- end_tests(reglas).
