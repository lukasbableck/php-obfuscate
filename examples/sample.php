<?php

// @obfuscate-keep function keep_me
function keep_me($value)
{
    $temp = $value + 1;
    return $temp;
}

function demo($value)
{
    $tmp = $value + 1;
    return $tmp;
}

class Demo
{
    private string $name = "secrets";

    private function run($value)
    {
        return $this->name . $value;
    }

    public function go($value)
    {
        return $this->run($value);
    }
}

echo demo(1);
