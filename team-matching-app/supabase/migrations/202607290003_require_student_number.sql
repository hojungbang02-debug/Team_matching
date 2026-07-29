begin;

update public.participants
set student_number = ''
where student_number is null;

alter table public.participants
  alter column student_number set not null;

commit;
