:- ensure_loaded(fichas).

%* ===================== Juegos de Pares y Triplas =====================
%! fichasDePareja(?F1, ?F2) is nondet.
%* Relaciona dos fichas que conforman un par, es decir iguales según ===/2.
fichasDePareja(F1, F2) :- F1 === F2.

%! fichasDeTripla(?F1, ?F2, ?F3) is nondet.
%* Relaciona tres fichas que conforman una tripla, es decir iguales según ===/2.
fichasDeTripla(F1, F2, F3) :- F1 === F2, F2 === F3.

%* ===================== Juegos de Escaleras =====================
%! fichasDeEscalera(?F1, ?F2, ?F3) is nondet.
%* Relaciona tres fichas que conforman una escalera, sin importar el orden relativo.
fichasDeEscalera(F1, F2, F3) :- mismoPalo(F1, F2, F3), numerosEnEscalera(F1, F2, F3).

%! mismoPalo(?F1, ?F2, ?F3) is nondet.
%* Relaciona tres fichas del mismo palo.
mismoPalo(F1, F2, F3) :- palo(P, F1), palo(P, F2), palo(P, F3).

%! numerosEnEscalera(?F1, ?F2, ?F3) is nondet.
%* Relaciona tres fichas cuyos números forman una escalera (aunque el palo no sea el mismo).
numerosEnEscalera(F1, F2, F3) :- sinNumerosRepetidos(F1, F2, F3),
    maxNumeroEntre(F1, F2, F3, Max), minNumeroEntre(F1, F2, F3, Min), (Max - Min) =:= 2.

%! sinNumerosRepetidos(?F1, ?F2, ?F3) is nondet.
%* Relaciona tres fichas con números distintos.
sinNumerosRepetidos(F1, F2, F3) :- numero(N1, F1), numero(N2, F2), numero(N3, F3), N1 \= N2, N2 \= N3, N1 \= N3.

%! maxNumeroEntre(?F1, ?F2, ?F3, -Max) is nondet.
%* Relaciona a tres fichas numéricas con el máximo número entre las tres.
maxNumeroEntre(F1, F2, F3, Max) :- numero(N1, F1), numero(N2, F2), numero(N3, F3), max3(N1, N2, N3, Max).

%! minNumeroEntre(?F1, ?F2, ?F3, -Min) is nondet.
%* Relaciona a tres fichas numéricas con el mínimo número entre las tres.
minNumeroEntre(F1, F2, F3, Min) :- numero(N1, F1), numero(N2, F2), numero(N3, F3), min3(N1, N2, N3, Min).

%! max3(+X, +Y, +Z, ?Max)
max3(X, Y, Z, Max) :-
    Max is max(X, max(Y, Z)).

%! min3(+X, +Y, +Z, ?Min)
min3(X, Y, Z, Min) :-
    Min is min(X, min(Y, Z)).

%* ===================== Combinaciones =====================
%! combinacion(+N, +Lista, -Elegidos, -Resto) is nondet.
%* Relaciona Elegidos, un sub-multiconjunto de tamaño N de Lista, con Resto,
%* los elementos restantes, preservando el orden relativo de Lista.
%* A diferencia de encadenar select/3 (que elige N posiciones en cualquier
%* orden), cada combinación de N elementos se genera una única vez, ya que
%* recorre Lista de una sola pasada decidiendo para cada ficha si entra en
%* Elegidos o queda en Resto.
combinacion(0, Resto, [], Resto).
combinacion(N, [X|Xs], [X|Ys], Resto) :-
    N > 0,
    N1 is N - 1,
    combinacion(N1, Xs, Ys, Resto).
combinacion(N, [X|Xs], Ys, [X|Resto]) :-
    N > 0,
    combinacion(N, Xs, Ys, Resto).

%! combinacionUnica(+N, +Lista, -Elegidos, -Resto) is nondet.
%* Como combinacion/4, pero sin repetir una combinación cuyo par
%* (Elegidos, Resto) ya haya salido por otro camino. combinacion/4
%* garantiza que cada combinación de POSICIONES se genera una única vez,
%* pero si Lista tiene fichas repetidas en distintas posiciones (p. ej.
%* [m4,m4,m5,m5]), varias combinaciones de posiciones distintas producen
%* el mismo (Elegidos, Resto) en VALOR (p. ej. elegir "el primer m4 y el
%* primer m5" o "el primer m4 y el segundo m5" da el mismo resultado, ya
%* que las fichas repetidas son indistinguibles). combinacionUnica/4
%* filtra esas repeticiones.
combinacionUnica(N, Lista, Elegidos, Resto) :-
    findall(Elegidos1-Resto1, combinacion(N, Lista, Elegidos1, Resto1), Combinaciones),
    list_to_set(Combinaciones, CombinacionesUnicas),
    member(Elegidos-Resto, CombinacionesUnicas).
