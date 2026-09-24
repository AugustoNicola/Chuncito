%* ===================== Reglas de la casa =====================
%* Las reglas opcionales ("house rules") con las que se juega una partida.
%* Se pasan como una lista de átomos, Reglas, a resultadoDeVictoria/6 (ver
%* resultado.pl); resultadoDeVictoria/5 equivale a jugar sin ninguna
%* (Reglas = []). A diferencia de los flags de Situacion (ver
%* situacion.pl), una regla no describe lo que pasó en la ronda sino cómo
%* se puntúa: es la misma para toda la partida.
%*
%* Agregar una regla nueva es agregar su átomo a reglaSoportada/1 y hacer
%* que el predicado afectado la consulte. Por ahora las reglas solo pueden
%* agregar yakus (ver yakuDeRegla/4 en yakus.pl, que yakusAplicables/4 en
%* yakus_aplicables.pl suma a los de yaku/3); los yakus así agregados pasan
%* por el mismo filtro de anulación que el resto, así que una regla que
%* agrega un yakuman anula sola a los yakus normales.

%! reglaSoportada(?Regla) is nondet.
%* Reglas reconocidas.
% riichiAbiertoRonYakuman: ganar por ron con riichi abierto (flag
% riichiAbierto) es yakuman en vez de 2 han. Qué rons califican (p. ej.
% solo si quien descartó no estaba en riichi) lo decide el cliente, que
% solo pasa la regla cuando corresponde: el motor no sabe nada de quién
% descartó.
reglaSoportada(riichiAbiertoRonYakuman).

%! reglasValidas(+Reglas) is semidet.
%* Corrobora que Reglas sea una lista y que todas sus reglas sean
%* reconocidas (ver reglaSoportada/1). Una regla desconocida hace fallar la
%* consulta en vez de ignorarse: puntuar con una regla que el motor no
%* conoce daría un resultado que parece correcto sin serlo.
reglasValidas(Reglas) :-
    is_list(Reglas),
    forall(member(Regla, Reglas), reglaSoportada(Regla)).
